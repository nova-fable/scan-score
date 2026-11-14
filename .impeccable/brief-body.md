# Surface Brief — ScanScore 全应用壳(墨绿书封重塑)

**Scope & mode**:整个应用(壳 + 曲库 + 详情练习页 + 设置页)的全量视觉重塑与布局精修;访客模式 Operate(完成任务的工作台)。

**Audience & job**:双支柱用户(五线谱学习者/教师 + 吉他手/现代乐手)。任务:导入纸质谱/图片/PDF/Guitar Pro → 离线 OMR 或 AI 转录 → 原图对照校对 → A-B 循环/节拍器/变速练习 → 曲库整理与导出。Proof:真实曲库数据、识别流水线四状态、引擎日志、校对编辑器。

**Constraints**:离线桌面应用——展示字体必须本地打包(经 @fontsource/bitter,不引 webfont 服务);保留全部现有功能(多选/批量/拖拽/键盘快捷键/焦点陷阱模态/练习状态持久化);`window.confirm` 不可用(wry);文案简体中文、位置可抽取(未来 i18n);窗口最小 1000×640,无响应式断点。

**Chosen direction & memorable moment**:墨绿书封(Real Book 双色封面世界)——曲库是一排绿/奶油交替的迷你书封;记忆点:卡片 hover 的「开书」页缘暗示 + 播放条的唯一校准轨(进度/A-B/小节刻度同轨)。

**Unresolved decisions**:设置页是否引入分节导航(暂保持单列 max-w-2xl);Bitter 打包体积待验证(预计 <200KB)。

## Direction contract

THESIS: 应用是一本摊开的 Real Book——封面文化(深墨绿油墨+奶油纸、粗壮书封排印)承载曲库与导航,内页文化(干净纸面排版)承载工作区;拒绝通用桌面工具「中性灰+单一强调色」的品类默认。

OWN-WORLD: 调色 = 深墨绿油墨 #16312a/#1e4636、奶油纸 #f7f1de、雕版黑 #1c2420、烫金 #c7a94e(稀缺:品牌分隔线/壳上焦点/校准轨 A-B 标记),状态四色为纸上专色(翡翠 #1e8756、蓝 #2e5e8c、红 #a8382c、琥珀 #a66b14)。类型 = Bitter 700/900 拉丁书封展示体(本地打包)+ 中文系统黑体;密度 = 紧凑桌面;控件全部标准 web 控件。

STORY: 打开即知「这是为乐谱而生的书架」:曲库是一排书封,状态是封面上贴的专色标签;点开一册 = 翻到内页,校对与练习在干净纸面上进行;识别流水线全程透明。

FIRST VIEWPORT: 深墨绿侧栏(约 224px:Bitter 品牌字 + 双细线分隔 + 导航[激活=奶油浅底+左缘奶油条] + 底部引擎署名)+ 奶油纸主区(左缘书脊装订内阴影):纸面工具栏(「曲库·共 N 册」标题 + 搜索/状态筛选/乐器筛选 + 墨绿实心「导入乐谱」主按钮,下缘细线)+ 书架网格(4 列,绿/奶油交替书封卡:双细线框居中排印封面、-2° 专色状态贴纸、底部书脊信息行);识别中卡显示 62% 蓝进度条,失败卡带红色重试。签名动作:卡片 hover 上浮微旋 + 右缘页缘条(开书暗示)。

FORM: 方向 = 我方候选清单第 4 项「Real Book 双色封面」(抽签指定),SEED REFERENCE: seed:eca65919e6dcddfb。构建路径 = 代码直建(Operate 面,无图像生成);构图基准 = .impeccable/mocks/decision/assigned.html。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
