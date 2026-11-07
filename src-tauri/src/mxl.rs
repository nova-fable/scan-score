//! MusicXML / MXL(.mxl 压缩包) 解包与元数据提取。

use std::fs::File;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MxlError {
    #[error("无法读取 zip: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("io 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("mxl 缺少 META-INF/container.xml 或 rootfile 声明")]
    NoRootFile,
    #[error("xml 解析错误: {0}")]
    Xml(String),
}

/// MusicXML 元数据
#[derive(Debug, Default, Clone)]
pub struct MusicMeta {
    pub title: Option<String>,
    pub composer: Option<String>,
    pub part_count: usize,
}

/// 解包 .mxl，返回主 MusicXML 文本。
/// .xml / .musicxml 直接读文件内容。
pub fn load_musicxml_text(path: &Path) -> Result<String, MxlError> {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if matches!(ext.as_str(), "mxl" | "zip") {
        unpack_mxl(path)
    } else {
        let mut s = String::new();
        File::open(path)?.read_to_string(&mut s)?;
        Ok(s)
    }
}

/// 解包 .mxl（zip 容器）：META-INF/container.xml 指向 rootfile full-path。
pub fn unpack_mxl(path: &Path) -> Result<String, MxlError> {
    let file = File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let root_path = {
        let mut container = zip.by_name("META-INF/container.xml")?;
        let mut text = String::new();
        container.read_to_string(&mut text)?;
        parse_rootfile_path(&text).ok_or(MxlError::NoRootFile)?
    };
    let mut root = zip.by_name(&root_path).map_err(|e| match e {
        zip::result::ZipError::FileNotFound => MxlError::NoRootFile,
        other => other.into(),
    })?;
    let mut text = String::new();
    root.read_to_string(&mut text)?;
    Ok(text)
}

fn parse_rootfile_path(container_xml: &str) -> Option<String> {
    let mut reader = Reader::from_str(container_xml);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"rootfile" {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"full-path" {
                            return attr
                                .decode_and_unescape_value(reader.decoder())
                                .ok()
                                .map(|v| v.into_owned());
                        }
                    }
                }
            }
            Ok(Event::Eof) => return None,
            Err(e) => {
                log::warn!("container.xml 解析失败: {e}");
                return None;
            }
            _ => {}
        }
    }
}

/// 从 MusicXML 文本提取 title / composer / 声部数量。
pub fn parse_meta(xml: &str) -> Result<MusicMeta, MxlError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut meta = MusicMeta::default();
    let mut path: Vec<&'static str> = Vec::new();
    let mut creator_type: Option<String> = None;
    let mut in_part_list = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                let tag = match name.as_ref() {
                    b"work-title" => Some("work-title"),
                    b"movement-title" => Some("movement-title"),
                    b"creator" => Some("creator"),
                    b"score-part" => Some("score-part"),
                    _ => None,
                };
                if let Some(tag) = tag {
                    path.push(tag);
                }
                if name.as_ref() == b"part-list" {
                    in_part_list = true;
                }
                if name.as_ref() == b"score-part" && in_part_list {
                    meta.part_count += 1;
                }
                if name.as_ref() == b"creator" {
                    creator_type = e
                        .attributes()
                        .flatten()
                        .find(|a| a.key.as_ref() == b"type")
                        .and_then(|a| a.decode_and_unescape_value(reader.decoder()).ok())
                        .map(|v| v.into_owned());
                }
            }
            Ok(Event::Text(t)) => {
                let text = t.unescape().map_err(|e| MxlError::Xml(e.to_string()))?;
                let text = text.trim().to_string();
                if text.is_empty() {
                    continue;
                }
                match path.last() {
                    Some(&"work-title") if meta.title.is_none() => meta.title = Some(text),
                    Some(&"movement-title") if meta.title.is_none() => meta.title = Some(text),
                    Some(&"creator") => {
                        if matches!(creator_type.as_deref(), Some("composer") | None)
                            && meta.composer.is_none()
                        {
                            meta.composer = Some(text);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"part-list" {
                    in_part_list = false;
                }
                creator_type = None;
                path.pop();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(MxlError::Xml(e.to_string())),
            _ => {}
        }
    }
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_meta() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise version="3.1">
            <work><work-title>Cucaracha</work-title></work>
            <identification>
                <creator type="composer">Traditional</creator>
            </identification>
            <part-list>
                <score-part id="P1"><part-name>Piano</part-name></score-part>
                <score-part id="P2"><part-name>Viola</part-name></score-part>
            </part-list>
        </score-partwise>"#;
        let meta = parse_meta(xml).unwrap();
        assert_eq!(meta.title.as_deref(), Some("Cucaracha"));
        assert_eq!(meta.composer.as_deref(), Some("Traditional"));
        assert_eq!(meta.part_count, 2);
    }

    #[test]
    fn test_parse_meta_movement_title_fallback() {
        let xml = r#"
        <score-timewise>
            <identification><creator>Anonymous</creator></identification>
            <movement-title>Test Suite</movement-title>
            <part-list><score-part id="P1"/></part-list>
        </score-timewise>"#;
        let meta = parse_meta(xml).unwrap();
        assert_eq!(meta.title.as_deref(), Some("Test Suite"));
        assert_eq!(meta.composer.as_deref(), Some("Anonymous"));
        assert_eq!(meta.part_count, 1);
    }
}
