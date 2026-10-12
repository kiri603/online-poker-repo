# 🃏 三国斗地主 · Online-Poker — 实时多人策略卡牌游戏

> 在经典斗地主玩法之上，融合《三国杀》式「武将技能」与「群体锦囊」机制的全栈 Web 联机对战平台。

## 🌐 在线体验与源码

  - **在线游玩地址：** [http://39.102.60.181/](http://39.102.60.181/)
  - **GitHub 源码：** [https://github.com/kiri603/online-poker-repo/](https://github.com/kiri603/online-poker-repo/)
  - **测试 / 反馈 QQ 群：** `1082246463`

## 💡 项目简介

本项目是一个支持多人实时联机、复杂技能结算、，并配备完整账号体系的 Web 端卡牌对战游戏。

  - **解决什么问题？** 传统的 Web 棋牌项目往往局限于简单的回合制发牌，缺乏应对高频并发操作和复杂多状态中断（如群体锦囊响应、被动技能插队结算）的工程方案。本项目通过自定义状态机 + 细粒度锁机制 + Redis 会话存储，解决了高并发下的状态同步难题。
  - **有什么特色玩法？** 在 54 张标准扑克的基础上引入：1) 7 个可选**武将技能**（制衡 / 乱箭 / 观星 / 固守 / 苦肉 / 铁骑 / 归心），覆盖主动 / 被动 / 觉醒 / 判定 / 响应保护多种触发模式；2) 4 张无花色**群体锦囊**（万箭齐发 / 南蛮入侵 / 五谷丰登 / 借刀杀人），加入后牌库扩展为 58 张。
  - **适用于什么场景？** 适合好友在线开黑娱乐，同时也是展示 **全栈开发、WebSocket 实时通信、并发编程、状态机设计、账号体系与持久化** 能力的完整工程实践。

## ✨ 核心特性

  - [x] **新手教学**：大厅可选择基础教程或锦囊牌进阶教程；小桃用“元气甜妹”中文配音引导本地模拟对局，基础完成后可继续学习四种锦囊。语音支持全局静音、暂停和退出清理。
  - [x] **⚡ 毫秒级实时同步**：基于 WebSocket 的双向通信，确保多人开局、出牌、技能结算、锦囊响应的极低延迟。
  - [x] **🧠 复杂业务状态机**：完整支持「借刀杀人」「五谷丰登」「万箭齐发 / 南蛮入侵」等 AOE 锦囊的挂起、插队响应、超时判定与状态恢复；以及「铁骑判定 → 压制」「苦肉觉醒 → 弃黑」等触发链。
  - [x] **👤 完整账号体系**：注册 / 登录 / 游客模式 / 验证码防刷 / 设备记住登录；个人中心展示等级、经验、注册时间、对局数、胜负、近 50 场胜率与战绩列表。
  - [x] **账号头像**：登录注册账号后，在右上角个人详情的“账号信息”中选择并保存头像；账号、等待大厅和牌桌同步展示，刷新或重新登录后保留。游客与脚本 AI 沿用默认头像。
  - [x] **🤖 脚本 AI 玩家**：支持房主一键添加 AI，自动进房、自动选技能、自动出牌、自动发表情、自动准备，方便单人测试与凑桌。
  - [x] **🏛️ 三国主题大厅**：联机大厅支持公开房间列表、房间号加入、私密房间、更新公告与游戏规则面板。
  - [x] **🎨 现代化沉浸式 UI**：基于 Vue 3 的响应式布局，桌面 / 平板 / 横屏 / 手机均适配，配合武将立绘、表情贴纸、压制特效等动效，交互自然。

## 🛠️ 技术栈

  - **前端架构：** `Vue 3` + `Vite` + CSS
  - **后端架构：** `Java 25` + `Spring Boot 4` + `Spring WebSocket` + `Spring Security Crypto`
  - **数据层：** `Spring Data JPA` + `MySQL` + `Flyway`（生产）/ `H2`（本地开发）
  - **缓存与会话：** `Redis`（Spring Session + 业务缓存）
  - **部署与运维：** 阿里云 CentOS + `Nginx` + `GitHub Actions` 自动化部署



## 📸 游戏截图

### 登录入口与账号体系

| 首页（快速开始 / 账号登录） | 账号登录 / 注册（含验证码） |
| :---: | :---: |
| ![首页](./promo-screenshots/01-auth-home.png) | ![登录](./promo-screenshots/02-auth-login-modal.png) |

### 联机大厅与更新公告

| 联机大厅（房间号加入 / 公开房间列表） | 更新公告（武将、AI、账号系统） |
| :---: | :---: |
| ![大厅](./promo-screenshots/03-lobby-room-list.png) | ![更新公告](./promo-screenshots/04-lobby-updates-panel.png) |

### 创建房间与等待大厅

| 创建房间（锦囊 / 武将 / 私密 开关） | 等待大厅（4 人位 + 脚本 AI + 旁观席） |
| :---: | :---: |
| ![创建房间](./promo-screenshots/05-create-room-modal.png) | ![等待大厅](./promo-screenshots/06-waiting-room.png) |

### 游戏对战桌面

| 出牌阶段（含表情面板与压制提示） | 锦囊响应阶段（南蛮入侵 · 弃红） |
| :---: | :---: |
| ![出牌](./promo-screenshots/07-game-board-action.png) | ![锦囊响应](./promo-screenshots/08-game-board-scroll-card.png) |

### 武将技能选择与游戏结算

| 7 武将技能选择（制衡 / 乱箭 / 观星 / 固守 / 苦肉 / 铁骑 / 归心） | 游戏结束（胜者 + 末手亮牌） |
| :---: | :---: |
| ![技能选择](./promo-screenshots/09-skill-selection.png) | ![游戏结束](./promo-screenshots/10-game-over.png) |

### 个人中心 · 战绩与等级

![个人中心](./promo-screenshots/11-account-profile.png)


## 🚀 本地运行部署

### 前端开发环境

```bash
cd poker-frontend
# 安装依赖
npm install
# 启动本地开发服务器
npm run dev
```

### 后端运行环境

*需确保本地已配置 `JDK 25` 及 `Maven` 环境；如需连接生产数据库请额外准备 `MySQL 8+` 与 `Redis`，否则默认使用内嵌 `H2`。*

```bash
cd poker
# 清理并打包项目（跳过测试）
mvn clean package -DskipTests
# 启动 Spring Boot 服务
java -jar target/poker-0.0.1-SNAPSHOT.jar
```

头像目录统一维护在 `poker-frontend/public/images/avatars/catalog.json`，Maven 打包时将其复制到后端资源中。注册账号通过 `GET /api/avatars` 获取选项，通过 `POST /api/avatars/me` 提交 `{ "avatarId": "general" }`；身份取自当前登录会话，只接受目录中的头像 ID。

头像选择保存在 `user_account.avatar_id`，旧账号为空时使用小桃笑脸。默认 H2 开发配置通过 Hibernate 更新字段；使用 Flyway 的 MySQL 配置通过 `V3__user_avatar.sql` 增加字段，按现有数据库发布流程执行迁移并重启后端。

### 微信登录与私有 OSS 头像

微信小游戏与网页版使用同一份 `UserAccount`。`id` 和 `username` 是固定玩家标识，战绩、经验、签到、好友、私聊与对局关联继续使用原值；网页登录按 `loginName` 查询，旧账号回填原用户名，登录请求仍提交 `username` 字段。登录名按大小写不敏感的 `login_name_key` 保持唯一。微信新账号没有密码，固定玩家 ID 为随机 `wx_` 标识，在小游戏账号设置中可首次开通网页登录名和密码。

微信首次登录遇到未绑定身份时，必须选择绑定已有账号或创建新账号。绑定需要原账号密码和验证码；已登录时只能绑定当前账号。绑定冲突拒绝覆盖，首版不支持解绑、换绑或两个已有账号的进度合并。`unionid` 仅保存，不据此自动合并。微信登录、密码登录和绑定成功共用事务提交后的 Session、remember Cookie、`tabToken` 和顶号流程。启动先恢复 `/api/auth/me`；被顶下线后等待玩家主动登录。

新增接口如下，错误继续使用 `{ "message": "..." }`。成功登录的 `AuthUserResponse` 增加 `loginName`、`wechatBound`、`passwordLoginEnabled`，其中 `username` 仍是固定玩家 ID。

| 接口 | 请求与用途 |
| --- | --- |
| `GET /api/auth/wechat/config` | 仅返回 `enabled`、`avatarEnabled` 开关，不返回凭据 |
| `POST /api/auth/wechat/exchange` | `{ code, purpose }`，用途为 `AUTH`、`CREDENTIALS` 或 `PROFILE`；返回 `{ ticket, bound, expiresIn: 300 }` |
| `POST /api/auth/wechat/login` | `{ ticket }`，登录已经绑定的账号 |
| `POST /api/auth/wechat/register` | `{ ticket }`，创建免密正式账号、统计记录和绑定 |
| `POST /api/auth/wechat/bind` | `{ ticket, loginName, password, captchaCode }`，验证密码与验证码后绑定 |
| `POST /api/auth/credentials` | 当前正式登录态及 `{ ticket, loginName, password }`，仅首次开通密码登录 |
| `POST /api/auth/wechat/profile` | 当前正式登录态及 `{ ticket, rawData, signature, syncNickname, syncAvatar }`，同步所选资料 |
| `GET /api/media/avatars/{assetId}` | 读取已发布的头像，支持 ETag 和一天缓存 |

票据为随机的一次性凭据，有效期五分钟，失败、过期、重复或用途不符后须重新调用 `wx.login` 换票。`CREDENTIALS`、`PROFILE` 还绑定当前账号和 `sessionVersion`。生产使用 `app.auth.redis-enabled=true` 的 Redis，原子取出并删除；Redis 不可用时拒绝换票，不降级到各实例内存。本地关闭 Redis 时使用内存票据，重启即失效。微信换票、建号、资料同步分别限流，密码绑定复用原密码失败限制与验证码。

小游戏启动先调用官方 [`wx.requirePrivacyAuthorize`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html)，收到成功回调后才恢复 `/api/auth/me`、获取验证码、换票或发送其他账号请求。使用微信官方统一弹窗，未注册自定义 `wx.onNeedPrivacyAuthorization` 监听；授权状态由微信决定，不用本地勾选标志代替。拒绝后可查看游戏规则、体验本地教学，主动点击“同意并继续”才再次申请；资料设置提供 `wx.openPrivacyContract` 指引入口。需在 MP 后台声明处理的昵称、头像及实际使用的其他个人信息，并按[小游戏隐私合规开发指南](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)配置官方隐私弹窗。文档说明官方组件启用后不可关闭，后台配置应先在测试环境核对。

头像、昵称授权与账号登录分别处理。绑定了微信的账号首次进入大厅时，先提示通过官方 [`wx.createUserInfoButton`](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.createUserInfoButton.html) 授权资料，玩家主动点击后才获取昵称和头像；可暂时跳过或拒绝，再从账号设置进入。首次提示按账号和设备记录展示标志，该标志不代表授权。后端验证 `SHA1(rawData + session_key)` 及当前微信绑定；昵称最多 64 个 Unicode 字符。数据库 `nickname` 使用 128 容量兼容 H2 的 UTF-16 计数。玩家可分别选择同步昵称、头像，拒绝资料授权仍可登录与游戏。小游戏使用原生授权按钮，小程序的 `chooseAvatar` 和 `input type="nickname"` WXML 组件不直接用于 Cocos 小游戏。

头像下载仅接受 `qlogo.cn` 及其子域的 HTTPS 地址，禁止跳转和内网解析；限制下载时间、2 MiB 大小及 2048×2048 原图尺寸，再裁剪并编码为 256×256 JPEG。后端上传至私有 OSS 的 `avatars/wechat/{userId}/{随机UUID}.jpg`，成功后更新数据库并通知牌桌。下载、上传或数据库提交失败保留原资料，清理未发布的新对象；清理失败会记录对象键供后续核对。旧头像对象暂不自动删除，不能对整个头像前缀设置会删除仍被账号引用对象的到期规则。

客户端保存后端稳定头像地址，不保存 OSS 签名 URL，不持有 OSS 凭据。私有 Bucket 的已发布游戏头像通过后端公开读取，以支持游客牌桌显示；此接口不提供任意对象访问。切回目录头像沿用 `POST /api/avatars/me`，头像加载失败回退默认图。

服务端配置可通过环境变量，或服务器工作目录下的私有 `config/application.properties` 注入。外部配置目录使用 `700`、配置文件使用 `600` 权限；替换 JAR 时保留该文件。默认不启用功能，不将真实值写入仓库或客户端：

| 环境变量 | 配置 |
| --- | --- |
| `POKER_WECHAT_ENABLED` | 默认 `false`；验收后再启用 |
| `POKER_WECHAT_APP_ID`、`POKER_WECHAT_APP_SECRET` | 对应小游戏的服务端凭据 |
| `POKER_AVATAR_OSS_ENABLED` | 默认 `false`，独立控制头像同步 |
| `POKER_AVATAR_OSS_ENDPOINT` | HTTPS OSS Endpoint |
| `POKER_AVATAR_OSS_REGION`、`POKER_AVATAR_OSS_BUCKET` | 例如 `cn-hangzhou` 与私有 Bucket 名 |
| `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` | 后端 RAM 身份凭据 |
| `OSS_SECURITY_TOKEN` | 使用 STS 时填写；当前凭据不会自动刷新，须由运行环境在过期前更新并重启服务 |

RAM 权限只授予目标 Bucket 的 `avatars/wechat/*` 对象所需 `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`；上传携带私有对象 ACL，部署时按官方权限说明核对 `oss:PutObjectAcl` 是否需要。不要授予 Bucket 公共读写或账户全权限。接口与权限依据[阿里云 OSS Java SDK](https://www.alibabacloud.com/help/en/oss/developer-reference/oss-java-sdk/)及[OSS 访问控制说明](https://www.alibabacloud.com/help/en/oss/user-guide/permissions-and-access-control-overview)。

发布前在隔离测试库校验 `V4__wechat_accounts.sql` 和 MySQL 专用 `V5__wechat_opaque_identity.sql`。后者将微信标识设为 `ascii_bin`，保证大小写敏感。迁移前检查旧用户名是否仅大小写不同，否则新登录名唯一索引会拒绝迁移；人工确定登录名时必须保留玩家 ID 和进度关联，不得自动合并。默认 H2 的兼容启动逻辑补齐旧字段；H2 到 MySQL 导入工具兼容没有微信表的旧源库，并保留已存在的微信绑定。MySQL 实例上的迁移验收仍需实际执行，不以 H2 兼容模式结果替代。

正式联调还需 HTTPS/WSS 游戏域名、微信请求与下载合法域名、MP 后台隐私声明，以及真实微信和 OSS 服务端配置。微信头像预览使用的 `qlogo.cn` 具体子域也需按实际返回地址配置下载域名。反向代理应只信任受控代理的转发信息，确保 `request.getRemoteAddr()` 是有效客户端地址，否则会共享微信 IP 限流额度。生产数据库迁移、开关启用与部署另行执行。

GitHub Actions 在前端构建和后端测试通过后发布，发布包携带 SHA256 校验值。当前 H2 服务器使用 `scripts/deploy-poker.sh`：只停止 `/poker` 中的游戏 Java 进程，将旧 JAR、前端、外部配置及关闭后的数据库备份到独立的 `/poker/backups/` 目录；在数据库副本上启动新版并核对账号、统计、好友、私聊、邀请和战绩的行数及数据校验值，通过后才替换正式程序。启动或接口检查失败时恢复旧程序，数据库备份保留；不会覆盖已产生的新数据。该脚本针对现有 H2 服务器，切换 MySQL 前须调整相应发布检查。

相关回归可在 `poker` 目录运行：

```powershell
./mvnw.cmd test '-Dtest=LoginNameIntegrationTest,WechatAuthIntegrationTest,WechatProfileIntegrationTest,WechatTicketStoreTest,WechatAvatarDownloaderTest,WechatSchemaMigrationTest,WechatDataImportTest,AuthServiceIntegrationTest,AuthTokenServiceTest,AvatarSystemIntegrationTest,GameWebSocketReliabilityTest'
```

### 小桃教程配音

教程共 38 段配音，覆盖邀请、基础教程、锦囊教程、完成、退出和异常提示。对白由 `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` 直接生成，开场邀请已按“呀，主公你来啦！”重新配音，原始试音仍保存在源目录。邀请和锦囊开场沿用最初选中的“元气甜妹”声音描述，其他修正版按试听反馈使用自然语气，基础教程完成对白使用平静、轻柔的鼓励语气。逐句声音描述、语气和随机种子记录在 `voice.json` 的 `delivery_profiles` 和 `line_profiles` 中。游戏从 `poker-frontend/public/audios/xiaotao/` 播放音频，换句会停止上一句，静音和暂停保留进度，退出时清理播放。

字幕使用每段音频与文案对齐得到的字词时间点，跟随实际播放时间显示。加载等待、弹窗和页面隐藏时，声音与字幕一起暂停；关闭声音、减少动态效果或音频失败时显示全文。玩家可以主动显示全文，或点击“跳过讲解”停止当前语音并继续；正常讲解结束后显示下一句或开始操作按钮。

对话框右上角的“小桃语音”仅控制教程讲解和退出提示，不影响背景音乐与游戏音效；右下角仍保留全局声音开关。“自动播放”默认关闭，开启后在当前教程内跨句、跨节继承，等待配音结束后推进讲解；静音或音频不可用时留出阅读时间。自动播放在弹窗和后台暂停，进入操作阶段时等待玩家行动，完成和异常页面仍由玩家手动选择。重新开始或重新进入教程时，自动播放恢复关闭。

音色描述、原始试音、逐句生成记录和 `listen.html` 试听页保存在 `poker-frontend/asset-sources/voices/xiaotao/`。VoiceDesign 用描述控制声音风格，不能保证不同对白拥有完全相同的声线。

修改教程对白后，在已配置 CUDA 版 PyTorch 的独立 Python 环境中，从仓库根目录执行：

```powershell
python -m pip install -r scripts/requirements-xiaotao-tts.txt
python scripts/generate_xiaotao_audios.py
```

可通过 `--model "本地模型目录"` 使用已下载的 VoiceDesign 模型。脚本按文案、逐句语气配置和文件校验值复用现有语音，只重新生成缺失或变化的片段，并更新音频目录和试听页。修正版使用不同文件名，避免浏览器继续播放旧缓存。`--prepare-only` 可更新目录与试听页；只有邀请文案与原始试音一致时才恢复原始邀请音频，它不合成新对白。

生成或更换音频后，在独立的字幕对齐环境中执行以下命令。`qwen-asr` 与 `qwen-tts` 依赖的 Transformers 版本不同，应分别安装。对齐使用本地模型 `Qwen/Qwen3-ForcedAligner-0.6B`，无需外部转写服务；同样支持 `--model "本地模型目录"`。时间点与音频和文案的 SHA256 绑定，修改后需重新对齐。

```powershell
python -m pip install -r scripts/requirements-xiaotao-alignment.txt
python scripts/align_xiaotao_audios.py
```

## 📅 未来规划

  - [ ] **武将池扩展**：在现有 7 名武将基础上，加入更复杂的连锁响应 / 触发链技能。
  - [ ] **锦囊扩充**：新增针对单人的指向性锦囊与连锁响应锦囊（如「无懈可击」式反制）。
  - [ ] **全局聊天频道**：在大厅加入跨房间的全局聊天与好友邀请，增强玩家互动。
  - [ ] **赛季 / 排位机制**：基于现有等级与胜率系统，加入赛季奖励与匹配分。
  - [ ] **观战与录像回放**：基于现有「旁观席」扩展为完整观战 + 局后回放功能。

## 🤝 贡献指南

欢迎提交 Pull Request 优化代码或提出 Issue 讨论新的游戏机制 / 武将技能 / 锦囊设计。如果这个项目对你有启发，欢迎点个 ⭐️ Star！

## 👨‍💻 作者

  - **GitHub:** [@kiri603](https://github.com/kiri603)
  - **邮箱:** 1306842652@qq.com / chenziqian0603@gmail.com
