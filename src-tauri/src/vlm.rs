//! 云端多模态大模型识别六线谱（实验性，可选功能）。
//! 输出 alphaTex 文本，alphaTab 可直接渲染+播放。
//! 兼容 OpenAI chat/completions 协议（默认适配智谱 bigmodel.cn）。

use std::path::Path;

use base64::Engine;
use crate::db::Db;

const DEFAULT_API_BASE: &str = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL: &str = "glm-4.6v";

/// 从设置读取 VLM 配置；key 非空才返回 Some
pub fn load_config(db: &Db) -> Option<VlmConfig> {
    let key = db.get_setting("vlm_api_key").ok().flatten()?;
    if key.trim().is_empty() {
        return None;
    }
    let base = db
        .get_setting("vlm_api_base")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API_BASE.into());
    let model = db
        .get_setting("vlm_model")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.into());
    let thinking = db
        .get_setting("vlm_thinking")
        .ok()
        .flatten()
        .map(|v| v != "off")
        .unwrap_or(true); // 默认开推理：转录准确率更高
    Some(VlmConfig {
        api_base: base.trim().trim_end_matches('/').to_string(),
        api_key: key.trim().to_string(),
        model,
        thinking,
    })
}

pub struct VlmConfig {
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    /// 允许推理（更准，更慢更贵）
    pub thinking: bool,
}

const SYSTEM_PROMPT: &str = r#"你是吉他六线谱(TAB)转录专家。把图中的六线谱转录为 alphaTex 格式(alphaTab 记谱文本)。

严格遵守:
1. 只输出 alphaTex 代码本体,禁止任何解释、注释或 markdown 代码块
2. 第一行: \title "曲名"(取图中标题,没有则用 Untitled);随后一行 \tempo 数值(取图中标注,没有用 120);第三行必须是单独一个 .
3. 弦号: 1 = 图中最上面的细弦(高音E), 6 = 最下面的粗弦(低音E), 标准调弦
4. 音符写法 品.弦, 如 5.4 表示 4 弦 5 品; 0 表示空弦; x.弦 表示闷音
5. 每小节用 | 分隔, 小节内音符用空格分隔
6. 节奏: 小节开始前可用 :4 或 :8 声明该小节默认时值(四分/八分), 按图中节奏杆推断; 拿不准统一 :8
7. 击弦(H)/勾弦(P)/滑弦(S/斜线) 用相邻音符连接表示: 前一个音符后加 {h} 或 {p} 或 {s}, 如 5.4{h}7.4
8. 忽略和弦指法图、歌词、指法标注; 图中装饰记号拿不准就省略
9. 多页/多行谱按顺序连续转录成一个整曲, 不要每个系统单独从头开始"#;

/// 把图片交给 VLM 转录为 alphaTex。
///
/// 请求阶梯（自动降级，直到拿到有效答案或穷尽）：
/// 1. 推理开启时：thinking=enabled + max_tokens 32768（推理型模型有充足预算边想边写）
/// 2. 严格端点不认识 thinking 字段（400）：去掉该字段重试
/// 3. 输出预算仍被思考耗尽（content 空且 finish=length）：thinking=disabled + 8192 重试
pub fn transcribe_tab(image_path: &Path, cfg: &VlmConfig) -> Result<String, String> {
    let data_url = encode_image_data_url(image_path)?;
    let url = format!("{}/chat/completions", cfg.api_base);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let make_body = |thinking: Option<bool>, max_tokens: u64| {
        let mut body = serde_json::json!({
            "model": cfg.model,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": [
                    { "type": "image_url", "image_url": { "url": data_url } },
                    { "type": "text", "text": "请把这张六线谱图转录为 alphaTex。" }
                ]}
            ]
        });
        match thinking {
            Some(true) => body["thinking"] = serde_json::json!({ "type": "enabled" }),
            Some(false) => body["thinking"] = serde_json::json!({ "type": "disabled" }),
            None => {}
        }
        body
    };

    let send = |body: &serde_json::Value| -> Result<(reqwest::StatusCode, String), String> {
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", cfg.api_key))
            .json(body)
            .send()
            .map_err(|e| format!("请求识别服务失败: {e}"))?;
        let status = resp.status();
        let text = resp.text().map_err(|e| e.to_string())?;
        Ok((status, text))
    };

    // 请求阶梯
    let mut attempts: Vec<(Option<bool>, u64)> = if cfg.thinking {
        vec![
            (Some(true), 32768),
            (None, 32768),
            (Some(false), 8192),
        ]
    } else {
        vec![(Some(false), 8192)]
    };
    attempts.reverse(); // pop 顺序

    let mut last_err: Option<String> = None;
    while let Some((thinking, max_tokens)) = attempts.pop() {
        let (status, text) = send(&make_body(thinking, max_tokens))?;
        if status == reqwest::StatusCode::BAD_REQUEST {
            // 多半是 thinking 字段或 max_tokens 超限不被接受 → 下一档
            last_err = Some(format!("HTTP 400: {}", text.chars().take(200).collect::<String>()));
            continue;
        }
        if !status.is_success() {
            return Err(format!(
                "识别服务返回 {status}: {}",
                text.chars().take(300).collect::<String>()
            ));
        }
        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("响应解析失败: {e}"))?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .trim();
        if !content.is_empty() {
            return Ok(normalize_alpha_tex(content));
        }
        let finish = json["choices"][0]["finish_reason"].as_str().unwrap_or("?").to_string();
        last_err = Some(match finish.as_str() {
            "length" => "模型思考耗尽了输出预算（content 为空）".to_string(),
            other => format!("模型返回空内容 (finish_reason={other})"),
        });
        // 还有下一档就继续
    }

    Err(format!(
        "{}——建议改用非推理模型（如 deepseek-chat / glm-4.6v），或在设置中关闭推理模式",
        last_err.unwrap_or_else(|| "所有请求档位均失败".into())
    ))
}

/// 拉取模型列表（OpenAI 兼容 GET /models；部分平台不支持则返回错误，前端回退手动输入）
pub fn fetch_models(api_base: &str, api_key: &str) -> Result<Vec<String>, String> {
    let base = api_base.trim().trim_end_matches('/');
    let url = format!("{base}/models");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .send()
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", text.chars().take(150).collect::<String>()));
    }
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("解析失败: {e}"))?;
    let mut ids: Vec<String> = if let Some(arr) = json["data"].as_array() {
        arr.iter()
            .filter_map(|m| m["id"].as_str())
            .map(|s| s.to_string())
            .collect()
    } else if let Some(arr) = json["models"].as_array() {
        // Ollama 原生格式兜底
        arr.iter()
            .filter_map(|m| m["name"].as_str().or_else(|| m["model"].as_str()))
            .map(|s| s.to_string())
            .collect()
    } else {
        return Err("响应中没有模型列表".into());
    };
    ids.sort();
    Ok(ids)
}

/// 清洗模型输出：去 markdown 代码块围栏（含语言标识行）、去首尾空白
pub fn normalize_alpha_tex(raw: &str) -> String {
    let text = raw.trim();
    if let Some(rest) = text.strip_prefix("```") {
        let after_fence = rest.trim_start();
        // 跳过围栏首行的语言标识（如 alphaTex / text），最多到换行
        let body = match after_fence.find('\n') {
            Some(idx) if idx < 32 => &after_fence[idx + 1..],
            _ => after_fence,
        };
        let body = body.trim_end();
        let body = match body.rfind("```") {
            Some(idx) => &body[..idx],
            None => body,
        };
        return body.trim().to_string();
    }
    text.to_string()
}

/// 测试连通性：发一个 1-token 的文本请求，返回模型回复或错误
pub fn ping(cfg: &VlmConfig) -> Result<String, String> {
    let url = format!("{}/chat/completions", cfg.api_base);
    let body = serde_json::json!({
        "model": cfg.model,
        "max_tokens": 4,
        "messages": [{ "role": "user", "content": "ping" }]
    });
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", cfg.api_key))
        .json(&body)
        .send()
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", text.chars().take(200).collect::<String>()));
    }
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("响应解析失败: {e}"))?;
    let model = json["model"].as_str().unwrap_or(&cfg.model);
    Ok(format!("连通 ✓（模型 {model}）"))
}

/// alphaTex 基本合法性检查（\开头指令 + 至少一个 音符.弦 记号）
pub fn looks_like_alpha_tex(text: &str) -> bool {
    let has_directive = text.trim_start().starts_with('\\');
    let has_note = text
        .split(|c: char| c.is_whitespace() || c == '|')
        .any(|tok| {
            let t = tok.trim();
            t.contains('.')
                && t.chars().next().is_some_and(|c| c.is_ascii_digit())
                && t.chars().filter(|c| *c == '.').count() == 1
        });
    has_directive && has_note
}

/// 读取图片 → 缩放（限制宽度和大小）→ data URL（jpeg base64）
fn encode_image_data_url(path: &Path) -> Result<String, String> {
    const MAX_WIDTH: u32 = 1600;
    const MAX_BYTES: usize = 3 * 1024 * 1024;

    let mut img = image::open(path).map_err(|e| format!("读取图片失败: {e}"))?;
    if img.width() > MAX_WIDTH {
        let h = ((img.height() as f64) * (MAX_WIDTH as f64 / img.width() as f64)).round() as u32;
        img = img.resize_exact(MAX_WIDTH, h.max(1), image::imageops::FilterType::Lanczos3);
    }

    let mut quality = 85;
    let mut bytes = Vec::new();
    loop {
        bytes.clear();
        let mut cursor = std::io::Cursor::new(&mut bytes);
        img.write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| format!("图片编码失败: {e}"))?;
        if bytes.len() <= MAX_BYTES || quality <= 40 {
            break;
        }
        quality -= 15;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_strips_fences() {
        let raw = "```alphaTex\n\\title \"X\"\n\\tempo 120\n.\n:8 3.4 5.4 |\n```";
        let out = normalize_alpha_tex(raw);
        assert!(out.starts_with("\\title"));
        assert!(out.ends_with('|'));
        assert!(!out.contains("```"));
    }

    #[test]
    fn test_looks_like_alpha_tex() {
        assert!(looks_like_alpha_tex("\\title \"X\"\n.\n:8 3.4 5.4 |"));
        assert!(!looks_like_alpha_tex("抱歉，我无法识别这张图片"));
        assert!(!looks_like_alpha_tex("\\title only"));
    }
}
