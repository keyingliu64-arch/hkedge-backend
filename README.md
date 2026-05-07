# HKEdge 粤港澳大湾区跨境医疗数据签署平台

## 项目概述

HKEdge 是一个面向粤港澳大湾区的跨境医疗数据签署平台，实现了医院与保险公司之间的电子合约签署功能，并支持医疗费用直赔结算。

## 核心特性

- ✅ **DocuSign 级 B2B 电子合约签署**：医院与保险公司之间的合约签署流程
- ✅ **三级用户权限体系**：平台管理员、保司用户、医院用户
- ✅ **医院编码统一标识**：使用医院编码作为唯一标识，替代医院名称
- ✅ **数据空间管理**：医院数据空间迁移与管理
- ✅ **数据流配置**：医院与保司之间的数据交互配置
- ✅ **患者数据管理**：患者信息、就诊记录、理赔数据
- ✅ **二维码签到**：患者签到功能
- ✅ **审计追踪**：完整的操作日志与合约审计
- ✅ **医疗直赔结算**：合约完成后才可进行直赔

## 技术架构

### 后端
- **框架**：Node.js + Express
- **数据库**：SQLite (sqlite3)
- **API 风格**：RESTful

### 前端
- **框架**：Vanilla JavaScript (原生 JS)
- **样式**：Tailwind CSS (CDN)
- **UI**：Font Awesome 图标库

## 项目结构

```
hkedge-server_0428/
├── server.js              # 后端服务主文件，包含所有 API 端点
├── hkedge.db              # SQLite 数据库文件（自动创建）
├── package.json           # 项目依赖配置
└── public/
    ├── index.html         # 管理控制台主页面
    └── sign.html          # 合约签署独立页面
```

## 启动方式

### 1. 进入项目目录
```bash
cd "/Users/caro/Desktop/HKEdge_Management console update_0428/hkedge-server_0428"
```

### 2. 安装依赖
```bash
npm install
```

### 3. 启动服务
```bash
node server.js
```

### 4. 访问应用
- 管理控制台：http://localhost:3000/index.html
- 合约签署页面：http://localhost:3000/sign.html
- 合约签署 (指定 ID)：http://localhost:3000/sign.html?id=1

## 数据库表结构

### 1. hospitals - 医院信息表
| 字段 | 说明 |
|------|------|
| hospital_code | 医院编码（唯一标识） |
| hospital_name | 医院名称 |
| hospital_name_en | 英文名称 |
| hospital_name_tc | 繁体中文名称 |
| data_space_id | 数据空间 ID |
| status | 状态 (active/inactive) |

### 2. users - 用户账号表
| 字段 | 说明 |
|------|------|
| username | 用户名（唯一） |
| password | 密码（明文存储） |
| role | 角色 (admin/insurance/hospital) |
| company_id | 保司 ID（保司用户） |
| hospital_code | 医院编码（医院用户） |

### 3. contracts - 电子合约表
| 字段 | 说明 |
|------|------|
| hospital_code | 医院编码 |
| hospital_name | 医院名称 |
| insurance_company | 保险公司 |
| contract_text | 合约内容 |
| hospital_signature | 医院方签名 (Base64) |
| insurance_signature | 保险方签名 (Base64) |
| status | 状态 (Pending Hospital → Pending Insurance → Completed) |

### 4. patients - 患者信息表
| 字段 | 说明 |
|------|------|
| patient_id | 患者 ID（唯一） |
| name | 姓名 |
| gender | 性别 |
| date_of_birth | 出生日期 |
| phone | 联系电话 |
| policy_id | 保单号 |
| insurance_company | 保险公司 |

### 5. visits - 就诊记录表
| 字段 | 说明 |
|------|------|
| visit_id | 就诊 ID（唯一） |
| patient_id | 患者 ID |
| hospital_code | 医院编码 |
| visit_date | 就诊日期 |
| department | 科室 |
| doctor | 医生 |
| diagnosis | 诊断结果 |
| treatment | 治疗方案 |
| total_amount | 总费用 |
| covered_amount | 报销金额 |

### 6. claims - 理赔记录表
| 字段 | 说明 |
|------|------|
| user_name | 用户姓名 |
| policy_id | 保单号 |
| hospital_code | 医院编码 |
| category | 类别 (Outpatient/Emergency) |
| total_amount | 总金额 |
| covered_amount | 报销金额 |
| copay_amount | 自付金额 |
| status | 状态 |

### 7. qr_checkins - 二维码签到表
| 字段 | 说明 |
|------|------|
| qr_code | 二维码内容（唯一） |
| hospital_code | 医院编码 |
| patient_id | 患者 ID |
| patient_name | 患者姓名 |
| status | 状态 (unused/used) |
| checked_in_at | 签到时间 |

### 8. data_flows - 数据流配置表
| 字段 | 说明 |
|------|------|
| hospital_code | 医院编码 |
| insurance_company | 保险公司 |
| sign_flow_enabled | 签署流开关 |
| data_sync_enabled | 数据同步开关 |
| sign_initiator | 签署发起方 |
| storage_location | 存储位置 |

### 9. data_spaces - 数据空间表
| 字段 | 说明 |
|------|------|
| space_id | 空间 ID（唯一） |
| space_name | 空间名称 |
| description | 描述 |

### 10. contract_audit_trail - 合约审计轨迹表
| 字段 | 说明 |
|------|------|
| contract_id | 合约 ID |
| action | 操作类型 |
| actor_username | 操作人用户名 |
| actor_role | 操作人角色 |
| detail | 详情 |

### 11. audit_logs - 审计日志表
| 字段 | 说明 |
|------|------|
| user_id | 操作人 ID |
| username | 用户名 |
| role | 角色 |
| action | 操作类型 |
| target_type | 目标类型 |
| target_id | 目标 ID |
| hospital_code | 医院编码 |
| detail | 详情 |

## 默认测试账号

| 用户名 | 密码 | 角色 | 绑定信息 | 说明 |
|--------|------|------|----------|------|
| admin | admin123 | 平台管理员 | 全局 | 拥有所有权限 |
| aia_admin | aia123 | 保司用户 | AIA Hong Kong | 可管理 AIA 相关合约 |
| hku_admin | hku123 | 医院用户 | H001 | 可管理香港大学深圳医院 |

## API 端点说明

### 认证相关
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/user` - 获取当前用户信息
- `POST /api/auth/logout` - 退出登录

### 合约管理
- `POST /api/admin/contracts` - 发起新合约
- `GET /api/admin/contracts` - 获取合约列表（角色过滤）
- `GET /api/admin/contracts/:id` - 获取合约详情
- `POST /api/admin/contracts/:id/sign` - 提交签名
- `GET /api/admin/contracts/:id/audit-trail` - 获取合约审计轨迹

### 医院管理
- `GET /api/admin/hospitals` - 获取医院列表
- `GET /api/admin/hospitals/:code` - 获取医院详情
- `POST /api/admin/hospitals` - 创建医院
- `POST /api/admin/hospitals/:code/migrate-space` - 迁移数据空间

### 数据空间与数据流
- `GET /api/admin/data-spaces` - 获取数据空间列表
- `POST /api/admin/data-spaces` - 创建数据空间
- `GET /api/admin/data-flows` - 获取数据流配置
- `POST /api/admin/data-flows` - 创建数据流配置

### 患者与就诊
- `GET /api/admin/patients` - 获取患者列表
- `POST /api/admin/patients` - 创建患者
- `GET /api/admin/visits` - 获取就诊记录

### 二维码签到
- `POST /api/admin/qrcode/generate` - 生成签到二维码
- `POST /api/admin/qrcode/checkin` - 扫码签到
- `GET /api/admin/qrcode/history` - 签到历史

### 数据统计与业务 API
- `GET /api/admin/dashboard` - 仪表盘数据（角色过滤）
- `GET /api/hospital/outbound-data` - 医院出站数据（发送到数据空间）
- `GET /api/insurance/inbound-data` - 保险公司入站数据
- `GET /api/admin/data-space-stats` - 数据空间统计
- `POST /api/pos/charge` - 医疗直赔结算

### 审计与用户管理
- `GET /api/admin/audit-logs` - 审计日志
- `GET /api/admin/users` - 用户列表
- `POST /api/admin/users` - 创建用户

## 核心业务流程

### 1. 合约签署流程
```
发起合约 → 医院签署 → 保险签署 → 完成直赔
```

1. **发起合约**：admin 或保司用户发起新合约，选择医院和保司
2. **医院签署**：医院用户登录，查看合约内容并签名
3. **保险签署**：保司用户登录，查看合约内容并签名
4. **完成直赔**：合约完成后，可进行医疗费用直赔结算

### 2. 数据流转
```
医院数据 → 数据空间 → 保险公司
```

## 数据安全与权限控制

### 三级 RBAC
- **admin**：平台管理员，可管理所有医院、用户、数据空间
- **insurance**：保司用户，可发起合约、查看本方医院数据、签署合约
- **hospital**：医院用户，可查看本院数据、签署合约

### 数据隔离
- 医院用户仅能查看本院数据
- 保司用户仅能查看本方关联医院数据
- 所有 API 均有 requireAuth 或 requireRole 权限校验

### 直赔网关
- 只有状态为 "Completed" 的合约才可进行直赔结算
- `/api/pos/charge` API 严格校验合约状态

## 注意事项

⚠️ **密码安全**：当前密码为明文存储，仅供测试使用，生产环境需要加密

⚠️ **会话管理**：使用内存变量存储 currentUser，服务重启后会话失效，且不支持多用户并发

⚠️ **依赖 n8n**：AI 问答功能依赖 n8n（http://localhost:5678），可选功能

## 开发与部署

### 本地开发
```bash
# 1. 进入目录
cd hkedge-server_0428

# 2. 安装依赖
npm install

# 3. 启动服务
node server.js
```

### 生产部署建议
- 使用 PostgreSQL/MySQL 替代 SQLite
- 实现真实的用户会话管理（Redis）
- 密码加密存储（bcrypt）
- 添加 HTTPS/TLS
- 实现文件存储（对象存储）
- 添加更多错误处理与日志

## 技术支持与文档

- 参考 CLAUDE.md 文件获取更多架构说明
- 查看 B2B Contract Signing 目录获取参考文档

---

## 快速开始

1. 启动服务器：`node server.js`
2. 访问 http://localhost:3000/index.html
3. 使用 admin/admin123 登录
4. 开始使用平台功能！

---

© 2026 HKEdge Project - 粤港澳大湾区跨境医疗数据签署平台