const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // 允许接收较大的 Base64 签名图片

// ==========================================
// 🌟 1. 数据库初始化 (引入 DocuSign 级签约表)
// ==========================================
const db = new sqlite3.Database('./hkedge.db', (err) => {
  if (err) {
    console.error('❌ 数据库连接失败:', err.message);
  } else {
    console.log('✅ 成功连接到 SQLite 本地数据库');
    
    // [表1] 聊天记录
    db.run(`CREATE TABLE IF NOT EXISTS chat_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, user_query TEXT, ai_response TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // [表2] 医院信息表 (核心：使用 Hospital Code 作为唯一标识)
    db.run(`CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_code TEXT UNIQUE NOT NULL,  -- 医院编码，唯一标识
      hospital_name TEXT NOT NULL,         -- 医院名称
      hospital_name_en TEXT,               -- 英文名称
      hospital_name_tc TEXT,               -- 繁体中文名称
      data_space_id TEXT,                  -- 所属数据空间ID
      status TEXT DEFAULT 'active',        -- 状态：active/inactive
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      // 插入测试医院数据
      const hospitals = [
        ['H001', '香港大学深圳医院', 'HKU-SZH', '香港大學深圳醫院', 'SPACE001'],
        ['H002', '北京协和医院', 'Peking Union Medical College Hospital', '北京協和醫院', 'SPACE001'],
        ['H003', '南方医科大学深圳医院', 'Southern Medical University Shenzhen Hospital', '南方醫科大學深圳醫院', 'SPACE002'],
        ['H004', '中山大学附属第一医院', 'First Affiliated Hospital of Sun Yat-sen University', '中山大學附屬第一醫院', 'SPACE002'],
        ['H005', '香港中文大学医院', 'CUHK Medical Centre', '香港中文大學醫院', 'SPACE001'],
        ['H006', '深圳和睦家医院', 'Shenzhen United Family Hospital', '深圳和睦家醫院', 'SPACE002'],
        ['H007', '广州医科大学附属第一医院', 'First Affiliated Hospital of Guangzhou Medical University', '廣州醫科大學附屬第一醫院', 'SPACE002'],
        ['H008', '澳门镜湖医院', 'Kiang Wu Hospital', '澳門鏡湖醫院', 'SPACE001']
      ];
      hospitals.forEach(h => {
        db.run(`INSERT OR IGNORE INTO hospitals (hospital_code, hospital_name, hospital_name_en, hospital_name_tc, data_space_id) 
                SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM hospitals WHERE hospital_code = ?)`, 
                [...h, h[0]]);
      });
    });

    // [表3] 用户账号表 (三级权限体系)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,       -- 用户名/登录账号
      password TEXT NOT NULL,              -- 密码（加密存储）
      role TEXT NOT NULL,                  -- 角色：admin / insurance / hospital
      company_id TEXT,                     -- 所属保司ID（保司用户）
      hospital_code TEXT,                  -- 所属医院编码（医院用户）
      permissions TEXT,                    -- 权限列表 JSON
      status TEXT DEFAULT 'active',        -- 状态：active/inactive
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code)
    )`, () => {
      // 插入默认管理员账号
      db.run(`INSERT OR IGNORE INTO users (username, password, role) 
              SELECT 'admin', 'admin123', 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')`);
      // 插入默认保司用户
      db.run(`INSERT OR IGNORE INTO users (username, password, role, company_id)
              SELECT 'aia_admin', 'aia123', 'insurance', 'AIA Hong Kong (友邦)' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'aia_admin')`);
      // 插入默认医院用户
      db.run(`INSERT OR IGNORE INTO users (username, password, role, hospital_code)
              SELECT 'hku_admin', 'hku123', 'hospital', 'H001' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'hku_admin')`);
      // 插入更多医院用户
      db.run(`INSERT OR IGNORE INTO users (username, password, role, hospital_code)
              SELECT 'shenzhen_admin', 'sz123456', 'hospital', 'H003' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'shenzhen_admin')`);
      db.run(`INSERT OR IGNORE INTO users (username, password, role, hospital_code)
              SELECT 'cuhk_admin', 'cuhk123', 'hospital', 'H005' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'cuhk_admin')`);
      db.run(`INSERT OR IGNORE INTO users (username, password, role, hospital_code)
              SELECT 'macau_admin', 'macau123', 'hospital', 'H008' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'macau_admin')`);
      // 插入保司子账号
      db.run(`INSERT OR IGNORE INTO users (username, password, role, company_id)
              SELECT 'aia_operator', 'aia123', 'insurance', 'AIA Hong Kong (友邦)' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'aia_operator')`);
      // 插入平台运维账号
      db.run(`INSERT OR IGNORE INTO users (username, password, role)
              SELECT 'operator', 'op123456', 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'operator')`);
    });

    // [表4] 数据空间表
    db.run(`CREATE TABLE IF NOT EXISTS data_spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT UNIQUE NOT NULL,       -- 空间标识
      space_name TEXT NOT NULL,            -- 空间名称
      description TEXT,                    -- 描述
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      const spaces = [
        ['SPACE001', '香港区域数据空间', '用于存储香港地区医院数据'],
        ['SPACE002', '深圳区域数据空间', '用于存储深圳地区医院数据'],
        ['SPACE003', '北京区域数据空间', '用于存储北京地区医院数据']
      ];
      spaces.forEach(s => {
        db.run(`INSERT OR IGNORE INTO data_spaces (space_id, space_name, description) 
                SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM data_spaces WHERE space_id = ?)`, 
                [...s, s[0]]);
      });
    });

    // [表5] 数据流配置表 (医院 ↔ 保司 ↔ HKEdge)
    db.run(`CREATE TABLE IF NOT EXISTS data_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_code TEXT NOT NULL,         -- 医院编码
      insurance_company TEXT NOT NULL,     -- 保险公司
      sign_flow_enabled INTEGER DEFAULT 1, -- 签署数据流开关
      data_sync_enabled INTEGER DEFAULT 1, -- 数据同步开关
      sign_initiator TEXT,                 -- 签署发起方：hospital/insurance
      sign_receiver TEXT,                  -- 签署接收方
      storage_location TEXT,               -- 存储位置
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code)
    )`, () => {
      const flows = [
        ['H001', 'AIA Hong Kong (友邦)', 1, 1, 'insurance', 'hospital', 'HKEdge Cloud'],
        ['H002', 'AIA Hong Kong (友邦)', 1, 1, 'insurance', 'hospital', 'HKEdge Cloud'],
        ['H003', 'AIA Hong Kong (友邦)', 1, 1, 'hospital', 'insurance', 'HKEdge Cloud'],
        ['H004', 'AIA Hong Kong (友邦)', 1, 1, 'insurance', 'hospital', 'HKEdge Cloud'],
        ['H005', 'AIA Hong Kong (友邦)', 1, 1, 'insurance', 'hospital', 'HKEdge Cloud'],
        ['H006', 'AIA Hong Kong (友邦)', 1, 1, 'hospital', 'insurance', 'HKEdge Cloud'],
        ['H007', 'AIA Hong Kong (友邦)', 1, 1, 'hospital', 'insurance', 'HKEdge Cloud'],
        ['H008', 'AIA Hong Kong (友邦)', 1, 1, 'insurance', 'hospital', 'HKEdge Cloud'],
        ['H003', 'Blue Cross (蓝十字)', 1, 1, 'insurance', 'hospital', 'Azure Hong Kong'],
        ['H005', 'Blue Cross (蓝十字)', 1, 1, 'insurance', 'hospital', 'Azure Hong Kong'],
        ['H006', 'Starr Insurance ( Starr)', 1, 1, 'hospital', 'insurance', 'AWS Singapore']
      ];
      flows.forEach(f => {
        db.run(`INSERT OR IGNORE INTO data_flows (hospital_code, insurance_company, sign_flow_enabled, data_sync_enabled, sign_initiator, sign_receiver, storage_location)
                SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM data_flows WHERE hospital_code = ? AND insurance_company = ?)`,
                [...f, f[0], f[1]]);
      });
    });
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,                     -- 操作人ID
      username TEXT,                       -- 操作人用户名
      role TEXT,                           -- 操作人角色
      action TEXT,                         -- 操作类型
      target_type TEXT,                    -- 操作对象类型
      target_id TEXT,                      -- 操作对象ID
      hospital_code TEXT,                  -- 关联医院编码
      detail TEXT,                         -- 操作详情
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // [表7] 理赔记录 (使用 hospital_code 替代 hospital_name)
    db.run(`CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_name TEXT, 
      policy_id TEXT, 
      hospital_code TEXT,                  -- 改为使用医院编码
      hospital_name TEXT,                  -- 保留名称用于展示
      category TEXT,        
      total_amount REAL, 
      covered_amount REAL, 
      copay_amount REAL, 
      status TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code)
    )`, () => {
      const sampleClaims = [
        ['张三', 'POL001', 'H001', '香港大学深圳医院', 'Outpatient', 200, 180, 20, 'Settled'],
        ['李四', 'POL002', 'H001', '香港大学深圳医院', 'Emergency', 5000, 5000, 0, 'Settled'],
        ['王五', 'POL003', 'H002', '北京协和医院', 'Outpatient', 300, 270, 30, 'Settled'],
        ['陈小明', 'POL004', 'H003', '南方医科大学深圳医院', 'Outpatient', 450, 400, 50, 'Settled'],
        ['林小红', 'POL005', 'H003', '南方医科大学深圳医院', 'Emergency', 8000, 8000, 0, 'Pending'],
        ['黄伟', 'POL001', 'H005', '香港中文大学医院', 'Outpatient', 350, 320, 30, 'Settled'],
        ['周杰', 'POL006', 'H006', '深圳和睦家医院', 'Outpatient', 1200, 1100, 100, 'Settled'],
        ['刘德华', 'POL002', 'H001', '香港大学深圳医院', 'Dental', 2500, 2250, 250, 'Settled'],
        ['张学友', 'POL007', 'H008', '澳门镜湖医院', 'Outpatient', 600, 540, 60, 'Pending'],
        ['黎明', 'POL003', 'H002', '北京协和医院', 'Emergency', 15000, 15000, 0, 'Settled'],
        ['郭富城', 'POL008', 'H004', '中山大学附属第一医院', 'Outpatient', 800, 720, 80, 'Settled'],
        ['甄子丹', 'POL009', 'H007', '广州医科大学附属第一医院', 'Outpatient', 550, 500, 50, 'Pending']
      ];
      sampleClaims.forEach(c => {
        db.run(`INSERT OR IGNORE INTO claims (user_name, policy_id, hospital_code, hospital_name, category, total_amount, covered_amount, copay_amount, status)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM claims WHERE user_name = ? AND hospital_code = ?)`,
                [...c, c[0], c[2]]);
      });
    });

    // [表8] 电子合约表 (DocuSign Architecture - 使用 Hospital Code)
    db.run(`CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_code TEXT NOT NULL,         -- 医院编码（核心标识）
      hospital_name TEXT,                  -- 医院名称（冗余用于展示）
      insurance_company TEXT,
      contract_text TEXT,                  -- 合同具体条款文本
      hospital_signature TEXT,             -- 医院方签名图像 (Base64)
      insurance_signature TEXT,            -- 保险方签名图像 (Base64)
      status TEXT DEFAULT 'Pending Hospital', -- 状态：Pending Hospital, Pending Insurance, Completed
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code)
    )`, () => {
      const sampleText = '鉴于甲方为合法设立并存续的医疗机构，乙方为合法设立并存续的保险公司，双方本着平等互利、共同发展的原则，就患者医疗费用直接结算（以下简称"直赔"）事宜，达成如下协议：\n\n1. 乙方同意将甲方纳入其医疗保险直赔网络。乙方承保的客户在甲方就诊时，符合保险责任范围内的医疗费用，由乙方直接向甲方支付。\n2. 门诊结算限额：每日最高 1500 港币。\n3. 急诊结算限额：每次最高 50000 港币。\n4. 牙科结算限额：每次最高 3000 港币。';
      const sampleText2 = '本协议由以下双方于2024年签署：\n\n甲方：医疗机构（以下简称"甲方"）\n乙方：保险公司（以下简称"乙方"）\n\n鉴于甲方具备提供医疗服务的能力，乙方同意为乙方客户提供医疗费用直赔服务。\n\n一、服务范围\n1. 门诊直赔服务\n2. 急诊直赔服务\n3. 住院直赔服务\n\n二、结算方式\n采用实时结算方式，乙方在收到甲方提交的医疗费用清单后，于3个工作日内完成审核并付款。';
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H001', '香港大学深圳医院', 'AIA Hong Kong (友邦)', ?, 'Pending Hospital'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H001')`, [sampleText]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H002', '北京协和医院', 'AIA Hong Kong (友邦)', ?, 'Pending Insurance'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H002')`, [sampleText]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H003', '南方医科大学深圳医院', 'AIA Hong Kong (友邦)', ?, 'Completed'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H003')`, [sampleText2]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H004', '中山大学附属第一医院', 'AIA Hong Kong (友邦)', ?, 'Completed'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H004')`, [sampleText]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H005', '香港中文大学医院', 'AIA Hong Kong (友邦)', ?, 'Pending Hospital'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H005')`, [sampleText2]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H006', '深圳和睦家医院', 'Blue Cross (蓝十字)', ?, 'Pending Insurance'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H006')`, [sampleText]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H007', '广州医科大学附属第一医院', 'AIA Hong Kong (友邦)', ?, 'Pending Hospital'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H007')`, [sampleText2]);
      db.run(`INSERT OR IGNORE INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status)
              SELECT 'H008', '澳门镜湖医院', 'Starr Insurance (Starr)', ?, 'Completed'
              WHERE NOT EXISTS (SELECT 1 FROM contracts WHERE hospital_code = 'H008')`, [sampleText]);
    });

    // [表9] 患者信息表
    db.run(`CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT UNIQUE NOT NULL,     -- 患者ID（唯一标识）
      name TEXT NOT NULL,                  -- 患者姓名
      name_en TEXT,                        -- 英文姓名
      gender TEXT,                         -- 性别
      date_of_birth DATE,                  -- 出生日期
      phone TEXT,                          -- 联系电话
      email TEXT,                          -- 邮箱
      policy_id TEXT,                      -- 保单号
      insurance_company TEXT,              -- 保险公司
      status TEXT DEFAULT 'active',        -- 状态
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      const patients = [
        ['P001', '张三', 'Zhang San', '男', '1985-06-15', '13800138001', 'zhang@example.com', 'POL001', 'AIA Hong Kong (友邦)'],
        ['P002', '李四', 'Li Si', '女', '1990-03-20', '13800138002', 'li@example.com', 'POL002', 'AIA Hong Kong (友邦)'],
        ['P003', '王五', 'Wang Wu', '男', '1978-11-08', '13800138003', 'wang@example.com', 'POL003', 'AIA Hong Kong (友邦)'],
        ['P004', '陈小明', 'Chen Xiaoming', '男', '1992-08-22', '13800138004', 'chenxm@example.com', 'POL004', 'AIA Hong Kong (友邦)'],
        ['P005', '林小红', 'Lin Xiaohong', '女', '1988-05-10', '13800138005', 'linxh@example.com', 'POL005', 'AIA Hong Kong (友邦)'],
        ['P006', '黄伟', 'Huang Wei', '男', '1995-12-03', '13800138006', 'huangw@example.com', 'POL001', 'AIA Hong Kong (友邦)'],
        ['P007', '周杰', 'Zhou Jie', '男', '1983-09-18', '13800138007', 'zhouj@example.com', 'POL006', 'Blue Cross (蓝十字)'],
        ['P008', '刘德华', 'Liu Dehua', '男', '1970-07-15', '13800138008', 'liudh@example.com', 'POL002', 'AIA Hong Kong (友邦)'],
        ['P009', '张学友', 'Zhang Xueyou', '男', '1966-07-10', '13800138009', 'zhangxy@example.com', 'POL007', 'Starr Insurance (Starr)'],
        ['P010', '黎明', 'Li Ming', '男', '1966-12-11', '13800138010', 'lim@example.com', 'POL003', 'AIA Hong Kong (友邦)'],
        ['P011', '郭富城', 'Guo Fucheng', '男', '1959-10-12', '13800138011', 'guofc@example.com', 'POL008', 'AIA Hong Kong (友邦)'],
        ['P012', '甄子丹', 'Donnie Yen', '男', '1963-07-27', '13800138012', 'yenzd@example.com', 'POL009', 'AIA Hong Kong (友邦)'],
        ['P013', '周润发', 'Chow Yun-fat', '男', '1955-05-18', '13800138013', 'zhouyf@example.com', 'POL010', 'Blue Cross (蓝十字)'],
        ['P014', '杨紫琼', 'Michelle Yeoh', '女', '1962-08-06', '13800138014', 'yangzq@example.com', 'POL011', 'Starr Insurance (Starr)'],
        ['P015', '成龙', 'Jackie Chan', '男', '1954-04-07', '13800138015', 'chengl@example.com', 'POL012', 'AIA Hong Kong (友邦)']
      ];
      patients.forEach(p => {
        db.run(`INSERT OR IGNORE INTO patients (patient_id, name, name_en, gender, date_of_birth, phone, email, policy_id, insurance_company) 
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM patients WHERE patient_id = ?)`, 
                [...p, p[0]]);
      });
    });

    // [表10] 就诊记录表
    db.run(`CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id TEXT UNIQUE NOT NULL,       -- 就诊ID
      patient_id TEXT NOT NULL,            -- 患者ID
      hospital_code TEXT NOT NULL,         -- 医院编码
      hospital_name TEXT,                  -- 医院名称
      visit_date DATE NOT NULL,            -- 就诊日期
      department TEXT,                     -- 科室
      doctor TEXT,                         -- 医生
      diagnosis TEXT,                      -- 诊断结果
      treatment TEXT,                      -- 治疗方案
      amount REAL,                         -- 费用金额
      covered_amount REAL,                 -- 报销金额
      status TEXT DEFAULT 'completed',     -- 状态：pending/completed/claimed
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code)
    )`, () => {
      const visits = [
        ['V001', 'P001', 'H001', '香港大学深圳医院', '2024-01-15', '内科', '陈医生', '普通感冒', '药物治疗', 200, 180],
        ['V002', 'P002', 'H001', '香港大学深圳医院', '2024-01-18', '外科', '王医生', '骨折', '手术治疗', 5000, 4500],
        ['V003', 'P003', 'H002', '北京协和医院', '2024-01-20', '心内科', '李医生', '高血压', '药物治疗', 300, 270],
        ['V004', 'P004', 'H003', '南方医科大学深圳医院', '2024-01-22', '骨科', '张医生', '腰椎间盘突出', '物理治疗', 800, 720],
        ['V005', 'P005', 'H003', '南方医科大学深圳医院', '2024-02-05', '妇产科', '林医生', '孕检', '常规检查', 350, 315],
        ['V006', 'P006', 'H001', '香港大学深圳医院', '2024-02-10', '眼科', '刘医生', '白内障', '手术治疗', 12000, 10800],
        ['V007', 'P007', 'H006', '深圳和睦家医院', '2024-02-15', '儿科', '赵医生', '发烧', '药物治疗', 280, 252],
        ['V008', 'P008', 'H001', '香港大学深圳医院', '2024-02-20', '皮肤科', '陈医生', '湿疹', '药物治疗', 450, 405],
        ['V009', 'P009', 'H008', '澳门镜湖医院', '2024-03-01', '内科', '王医生', '糖尿病', '药物治疗', 600, 540],
        ['V010', 'P010', 'H002', '北京协和医院', '2024-03-05', '急诊', '李医生', '急性胃炎', '输液治疗', 1500, 1350],
        ['V011', 'P011', 'H004', '中山大学附属第一医院', '2024-03-10', '神经内科', '周医生', '偏头痛', '药物治疗', 400, 360],
        ['V012', 'P012', 'H007', '广州医科大学附属第一医院', '2024-03-15', '呼吸科', '吴医生', '肺炎', '住院治疗', 8500, 7650],
        ['V013', 'P013', 'H006', '深圳和睦家医院', '2024-03-20', '牙科', '郑医生', '蛀牙', '补牙治疗', 800, 720],
        ['V014', 'P014', 'H005', '香港中文大学医院', '2024-03-25', '心血管科', '冯医生', '心律不齐', '检查治疗', 2200, 1980],
        ['V015', 'P015', 'H001', '香港大学深圳医院', '2024-04-01', '消化内科', '陈医生', '胃溃疡', '药物治疗', 550, 495],
        ['V016', 'P001', 'H002', '北京协和医院', '2024-04-05', '内科', '李医生', '体检', '全面检查', 1200, 1080],
        ['V017', 'P002', 'H003', '南方医科大学深圳医院', '2024-04-10', '眼科', '张医生', '青光眼', '药物治疗', 1800, 1620],
        ['V018', 'P003', 'H005', '香港中文大学医院', '2024-04-15', '骨科', '冯医生', '关节炎', '物理治疗', 950, 855],
        ['V019', 'P004', 'H008', '澳门镜湖医院', '2024-04-20', '内分泌科', '王医生', '甲状腺功能亢进', '药物治疗', 750, 675],
        ['V020', 'P005', 'H001', '香港大学深圳医院', '2024-04-25', '妇产科', '陈医生', '妇科检查', '常规检查', 300, 270]
      ];
      visits.forEach(v => {
        db.run(`INSERT OR IGNORE INTO visits (visit_id, patient_id, hospital_code, hospital_name, visit_date, department, doctor, diagnosis, treatment, amount, covered_amount) 
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM visits WHERE visit_id = ?)`, 
                [...v, v[0]]);
      });
    });

    // [表11] 二维码签到表
    db.run(`CREATE TABLE IF NOT EXISTS qr_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qr_code TEXT UNIQUE NOT NULL,        -- 二维码内容
      hospital_code TEXT NOT NULL,         -- 医院编码
      patient_id TEXT,                     -- 患者ID（签到后填充）
      patient_name TEXT,                   -- 患者姓名
      status TEXT DEFAULT 'unused',        -- 状态：unused/used/expired
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checked_in_at DATETIME,              -- 签到时间
      FOREIGN KEY (hospital_code) REFERENCES hospitals(hospital_code),
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    )`, () => {
      const qrCodes = [
        ['QR20240115001', 'H001', 'P001', '张三', 'unused'],
        ['QR20240118001', 'H001', 'P002', '李四', 'used'],
        ['QR20240120001', 'H002', 'P003', '王五', 'used'],
        ['QR20240122001', 'H003', 'P004', '陈小明', 'used'],
        ['QR20240205001', 'H003', 'P005', '林小红', 'unused'],
        ['QR20240210001', 'H001', 'P006', '黄伟', 'used'],
        ['QR20240215001', 'H006', 'P007', '周杰', 'unused'],
        ['QR20240220001', 'H001', 'P008', '刘德华', 'used'],
        ['QR20240301001', 'H008', 'P009', '张学友', 'used'],
        ['QR20240305001', 'H002', 'P010', '黎明', 'unused'],
        ['QR20240310001', 'H004', 'P011', '郭富城', 'used'],
        ['QR20240315001', 'H007', 'P012', '甄子丹', 'unused'],
        ['QR20240320001', 'H006', 'P013', '周润发', 'used'],
        ['QR20240325001', 'H005', 'P014', '杨紫琼', 'used'],
        ['QR20240401001', 'H001', 'P015', '成龙', 'unused']
      ];
      qrCodes.forEach(q => {
        db.run(`INSERT OR IGNORE INTO qr_checkins (qr_code, hospital_code, patient_id, patient_name, status)
                SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM qr_checkins WHERE qr_code = ?)`,
                [...q, q[0]]);
      });
    });

    // [表12] 合约审计轨迹表
    db.run(`CREATE TABLE IF NOT EXISTS contract_audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor_username TEXT,
      actor_role TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )`);
  }
});


// ==========================================
// 🌟 2. AI 问答子系统
// ==========================================
app.get('/api/health', (req, res) => res.json({ code: "10000", msg: "HKEdge Backend Running" }));
app.get('/api/history', (req, res) => {
  db.all(`SELECT * FROM chat_records ORDER BY created_at DESC LIMIT 50`, [], (err, rows) => res.json({ data: rows }));
});
app.post('/api/chat', async (req, res) => {
  const { sessionId, query } = req.body;
  try {
    const n8nRes = await axios.post('http://localhost:5678/webhook/ai-chat', { sessionId: sessionId || "sess", query });
    db.run(`INSERT INTO chat_records (session_id, user_query, ai_response) VALUES (?, ?, ?)`, [sessionId, query, n8nRes.data.data.reply]);
    res.json(n8nRes.data);
  } catch (error) { res.status(500).json({ msg: "AI Server Error" }); }
});


// ==========================================
// 🌟 3. 医疗直赔结算子系统 (极度严格)
// ==========================================
app.post('/api/pos/charge', (req, res) => {
  const { user_name, policy_id, company, hospital, category, amount } = req.body;
  
  // 核心拦截：只允许 status 为 'Completed' (双方均已签名) 的合同进行直赔！
  db.get(`SELECT * FROM contracts WHERE hospital_name = ? AND insurance_company = ? AND status = 'Completed'`, [hospital, company], (err, contractRow) => {
    if (!contractRow) {
      console.log(`❌ 拒绝直赔：${hospital} 与 ${company} 的合同尚未完成电子签名！`);
      return res.status(403).json({
        code: "40300", msg: "Direct Billing Denied",
        error_detail: `The digital contract between ${hospital} and ${company} is incomplete.`
      });
    }

    let covered = category === 'Emergency' ? amount : Math.min(amount, 1500);
    let copay = amount - covered;

    db.run(`INSERT INTO claims (user_name, policy_id, hospital_code, hospital_name, category, total_amount, covered_amount, copay_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_name, policy_id, contractRow.hospital_code, hospital, category, amount, covered, copay, 'Settled'], function(err) {
      res.json({ code: "10000", msg: "Direct Billing Success" });
    });
  });
});

app.get('/api/claims', (req, res) => {
  db.all(`SELECT * FROM claims WHERE user_name = ? ORDER BY created_at DESC`, [req.query.user_name], (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});


// ==========================================
// 🌟 4. 用户认证与权限中间件
// ==========================================
let currentUser = null;

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ? AND status = 'active'`, [username, password], (err, user) => {
    if (!user) {
      return res.status(401).json({ code: "40100", msg: "用户名或密码错误" });
    }
    currentUser = user;
    res.json({ code: "10000", msg: "登录成功", data: { id: user.id, username: user.username, role: user.role, company_id: user.company_id, hospital_code: user.hospital_code } });
  });
});

app.get('/api/auth/user', (req, res) => {
  if (!currentUser) {
    return res.status(401).json({ code: "40100", msg: "未登录" });
  }
  res.json({ code: "10000", data: currentUser });
});

app.post('/api/auth/logout', (req, res) => {
  currentUser = null;
  res.json({ code: "10000", msg: "退出成功" });
});

function requireAuth(req, res, next) {
  if (!currentUser) {
    return res.status(401).json({ code: "40100", msg: "请先登录" });
  }
  req.user = currentUser;
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!currentUser || !roles.includes(currentUser.role)) {
      return res.status(403).json({ code: "40300", msg: "权限不足" });
    }
    req.user = currentUser;
    next();
  };
}

// ==========================================
// 🌟 5. 医院管理 API (使用 Hospital Code)
// ==========================================
app.get('/api/admin/hospitals', requireAuth, (req, res) => {
  let query = `SELECT * FROM hospitals ORDER BY hospital_code`;
  let params = [];
  
  if (currentUser.role === 'insurance') {
    query = `SELECT h.* FROM hospitals h 
             JOIN data_flows df ON h.hospital_code = df.hospital_code 
             WHERE df.insurance_company = ? ORDER BY h.hospital_code`;
    params = [currentUser.company_id];
  } else if (currentUser.role === 'hospital') {
    query = `SELECT * FROM hospitals WHERE hospital_code = ?`;
    params = [currentUser.hospital_code];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.get('/api/admin/hospitals/:code', requireAuth, (req, res) => {
  db.get(`SELECT * FROM hospitals WHERE hospital_code = ?`, [req.params.code], (err, row) => {
    if (!row) return res.status(404).json({ code: "40400", msg: "医院不存在" });
    res.json({ code: "10000", data: row });
  });
});

app.post('/api/admin/hospitals', requireRole(['admin', 'insurance']), (req, res) => {
  const { hospital_code, hospital_name, hospital_name_en, hospital_name_tc, data_space_id } = req.body;
  
  if (!hospital_code || !hospital_name) {
    return res.status(400).json({ code: "40000", msg: "医院编码和名称为必填项" });
  }
  
  db.run(`INSERT INTO hospitals (hospital_code, hospital_name, hospital_name_en, hospital_name_tc, data_space_id) 
          VALUES (?, ?, ?, ?, ?)`, [hospital_code, hospital_name, hospital_name_en, hospital_name_tc, data_space_id], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "创建失败，编码可能已存在" });
    logAction(currentUser, 'create', 'hospital', hospital_code, `创建医院: ${hospital_code} - ${hospital_name}`);
    res.json({ code: "10000", msg: "医院创建成功" });
  });
});

app.put('/api/admin/hospitals/:code', requireRole(['admin', 'insurance']), (req, res) => {
  const { hospital_name, hospital_name_en, hospital_name_tc, data_space_id } = req.body;
  db.run(`UPDATE hospitals SET hospital_name = ?, hospital_name_en = ?, hospital_name_tc = ?, data_space_id = ?, updated_at = CURRENT_TIMESTAMP WHERE hospital_code = ?`, 
    [hospital_name, hospital_name_en, hospital_name_tc, data_space_id, req.params.code], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "更新失败" });
    logAction(currentUser, 'update', 'hospital', req.params.code, `更新医院信息`);
    res.json({ code: "10000", msg: "医院信息更新成功" });
  });
});

// ==========================================
// 🌟 6. 用户账号管理 API
// ==========================================
app.get('/api/admin/users', requireRole(['admin', 'hospital']), (req, res) => {
  let query = `SELECT id, username, role, company_id, hospital_code, status, created_at FROM users ORDER BY role, created_at`;
  let params = [];
  if (currentUser.role === 'hospital') {
    query = `SELECT id, username, role, company_id, hospital_code, status, created_at FROM users WHERE hospital_code = ? ORDER BY created_at`;
    params = [currentUser.hospital_code];
  }
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.post('/api/admin/users', requireRole(['admin', 'insurance', 'hospital']), (req, res) => {
  const { username, password, role, company_id, hospital_code, permissions } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ code: "40000", msg: "用户名、密码和角色为必填项" });
  }

  if (currentUser.role === 'hospital') {
    if (role !== 'hospital') {
      return res.status(403).json({ code: "40300", msg: "医院用户只能创建本院子用户" });
    }
    db.run(`INSERT INTO users (username, password, role, hospital_code, permissions) VALUES (?, ?, 'hospital', ?, ?)`,
      [username, password, currentUser.hospital_code, JSON.stringify(permissions)], function(err) {
      if (err) return res.status(500).json({ code: "50000", msg: "创建失败，用户名可能已存在" });
      logAction(currentUser, 'create', 'user', username, `创建医院子用户: ${username}`);
      res.json({ code: "10000", msg: "用户创建成功" });
    });
    return;
  }

  db.run(`INSERT INTO users (username, password, role, company_id, hospital_code, permissions) VALUES (?, ?, ?, ?, ?, ?)`,
    [username, password, role, company_id, hospital_code, JSON.stringify(permissions)], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "创建失败，用户名可能已存在" });
    logAction(currentUser, 'create', 'user', username, `创建用户: ${username} (${role})`);
    res.json({ code: "10000", msg: "用户创建成功" });
  });
});

// ==========================================
// 🌟 7. 数据空间管理 API
// ==========================================
app.get('/api/admin/data-spaces', requireAuth, (req, res) => {
  db.all(`SELECT * FROM data_spaces ORDER BY space_id`, [], (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.post('/api/admin/data-spaces', requireRole(['admin']), (req, res) => {
  const { space_id, space_name, description } = req.body;
  db.run(`INSERT INTO data_spaces (space_id, space_name, description) VALUES (?, ?, ?)`, 
    [space_id, space_name, description], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "创建失败，空间ID可能已存在" });
    logAction(currentUser, 'create', 'data_space', space_id, `创建数据空间: ${space_id} - ${space_name}`);
    res.json({ code: "10000", msg: "数据空间创建成功" });
  });
});

// 医院数据空间迁移
app.post('/api/admin/hospitals/:code/migrate-space', requireRole(['admin']), (req, res) => {
  const { target_space_id } = req.body;
  
  db.get(`SELECT * FROM hospitals WHERE hospital_code = ?`, [req.params.code], (err, hospital) => {
    if (!hospital) return res.status(404).json({ code: "40400", msg: "医院不存在" });
    
    const oldSpace = hospital.data_space_id;
    
    db.run(`UPDATE hospitals SET data_space_id = ?, updated_at = CURRENT_TIMESTAMP WHERE hospital_code = ?`, 
      [target_space_id, req.params.code], function(err) {
      if (err) return res.status(500).json({ code: "50000", msg: "迁移失败" });
      logAction(currentUser, 'migrate', 'hospital', req.params.code, 
        `医院迁移数据空间: ${hospital.hospital_name} (${oldSpace} -> ${target_space_id})`);
      res.json({ code: "10000", msg: "数据空间迁移成功", data: { old_space: oldSpace, new_space: target_space_id } });
    });
  });
});

// ==========================================
// 🌟 8. 数据流管理 API
// ==========================================
app.get('/api/admin/data-flows', requireAuth, (req, res) => {
  let query = `SELECT df.*, h.hospital_name FROM data_flows df LEFT JOIN hospitals h ON df.hospital_code = h.hospital_code ORDER BY df.created_at DESC`;
  let params = [];
  
  if (currentUser.role === 'insurance') {
    query = `SELECT df.*, h.hospital_name FROM data_flows df LEFT JOIN hospitals h ON df.hospital_code = h.hospital_code WHERE df.insurance_company = ? ORDER BY df.created_at DESC`;
    params = [currentUser.company_id];
  } else if (currentUser.role === 'hospital') {
    query = `SELECT df.*, h.hospital_name FROM data_flows df LEFT JOIN hospitals h ON df.hospital_code = h.hospital_code WHERE df.hospital_code = ? ORDER BY df.created_at DESC`;
    params = [currentUser.hospital_code];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.post('/api/admin/data-flows', requireRole(['admin', 'insurance']), (req, res) => {
  const { hospital_code, insurance_company, sign_flow_enabled, data_sync_enabled, sign_initiator, sign_receiver, storage_location } = req.body;
  
  db.run(`INSERT INTO data_flows (hospital_code, insurance_company, sign_flow_enabled, data_sync_enabled, sign_initiator, sign_receiver, storage_location) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [hospital_code, insurance_company, sign_flow_enabled || 1, data_sync_enabled || 1, sign_initiator, sign_receiver, storage_location], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "创建失败" });
    logAction(currentUser, 'create', 'data_flow', hospital_code, `创建数据流配置: ${hospital_code} x ${insurance_company}`);
    res.json({ code: "10000", msg: "数据流配置创建成功" });
  });
});

app.put('/api/admin/data-flows/:id', requireRole(['admin']), (req, res) => {
  const { sign_flow_enabled, data_sync_enabled, sign_initiator, sign_receiver, storage_location } = req.body;
  
  db.run(`UPDATE data_flows SET sign_flow_enabled = ?, data_sync_enabled = ?, sign_initiator = ?, sign_receiver = ?, storage_location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
    [sign_flow_enabled, data_sync_enabled, sign_initiator, sign_receiver, storage_location, req.params.id], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "更新失败" });
    logAction(currentUser, 'update', 'data_flow', req.params.id, `更新数据流配置`);
    res.json({ code: "10000", msg: "数据流配置更新成功" });
  });
});

// ==========================================
// 🌟 9. 审计日志 API
// ==========================================
app.get('/api/admin/audit-logs', requireAuth, (req, res) => {
  const { hospital_code, role, start_date, end_date } = req.query;
  let query = `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
  let params = [];
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

function logAction(user, action, targetType, targetId, detail) {
  db.run(`INSERT INTO audit_logs (user_id, username, role, action, target_type, target_id, hospital_code, detail) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
    [user.id, user.username, user.role, action, targetType, targetId, user.hospital_code, detail]);
}

// ==========================================
// 🌟 10. B端 DocuSign 管理后台 API (使用 Hospital Code)
// ==========================================
app.post('/api/admin/contracts', requireRole(['admin', 'insurance']), (req, res) => {
  const { hospital_code, insurance_company, contract_text, notify_method } = req.body;
  const defaultText = "鉴于甲方为合法设立并存续的医疗机构，乙方为合法设立并存续的保险公司，双方本着平等互利、共同发展的原则，就患者医疗费用直接结算（以下简称”直赔”）事宜，达成如下协议：\n\n1. 乙方同意将甲方纳入其医疗保险直赔网络。乙方承保的客户在甲方就诊时，符合保险责任范围内的医疗费用，由乙方直接向甲方支付。\n2. 门诊结算限额：每日最高 1500 港币。";

  if (!hospital_code) {
    return res.status(400).json({ code: "40000", msg: "医院编码为必填项" });
  }

  db.get(`SELECT * FROM hospitals WHERE hospital_code = ?`, [hospital_code], (err, hospital) => {
    if (!hospital) {
      return res.status(404).json({ code: "40400", msg: "医院不存在，请检查医院编码" });
    }

    db.get(`SELECT * FROM contracts WHERE hospital_code = ? AND insurance_company = ?`, [hospital_code, insurance_company], (err, row) => {
      if (row) {
        return res.status(400).json({ code: "40000", msg: "该医疗机构与保险公司之间已存在合作网络记录，请勿重复发起。" });
      }
      
      db.run(`INSERT INTO contracts (hospital_code, hospital_name, insurance_company, contract_text, status) VALUES (?, ?, ?, ?, 'Pending Hospital')`,
        [hospital_code, hospital.hospital_name, insurance_company, contract_text || defaultText], function(err) {
        if (err) return res.status(500).json({ code: "50000", msg: "写入数据库失败" });
        const cid = this.lastID;
        logAction(currentUser, 'initiate', 'contract', cid, `发起签署邀请: ${hospital_code} - ${hospital.hospital_name}`);
        db.run(`INSERT INTO contract_audit_trail (contract_id, action, actor_username, actor_role, detail) VALUES (?, 'initiated', ?, ?, ?)`,
          [cid, currentUser.username, currentUser.role, `通知方式: ${notify_method || 'direct'}`]);
        console.log(`📝 已发起新签约流程！${hospital.hospital_name} x ${insurance_company}`);
        res.json({ code: "10000", msg: "Contract Initiated Successfully", data: { hospital_code, hospital_name: hospital.hospital_name } });
      });
    });
  });
});

app.get('/api/admin/contracts', requireAuth, (req, res) => {
  let query = `SELECT id, hospital_code, hospital_name, insurance_company, status, created_at FROM contracts ORDER BY created_at DESC`;
  let params = [];
  
  if (currentUser.role === 'insurance') {
    query = `SELECT id, hospital_code, hospital_name, insurance_company, status, created_at FROM contracts WHERE insurance_company = ? ORDER BY created_at DESC`;
    params = [currentUser.company_id];
  } else if (currentUser.role === 'hospital') {
    query = `SELECT id, hospital_code, hospital_name, insurance_company, status, created_at FROM contracts WHERE hospital_code = ? ORDER BY created_at DESC`;
    params = [currentUser.hospital_code];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.get('/api/admin/contracts/:id', requireAuth, (req, res) => {
  db.get(`SELECT * FROM contracts WHERE id = ?`, [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ code: "40400", msg: "Contract not found" });
    
    if (currentUser.role === 'insurance' && row.insurance_company !== currentUser.company_id) {
      return res.status(403).json({ code: "40300", msg: "无权访问此合约" });
    }
    if (currentUser.role === 'hospital' && row.hospital_code !== currentUser.hospital_code) {
      return res.status(403).json({ code: "40300", msg: "无权访问此合约" });
    }
    
    res.json({ code: "10000", data: row });
  });
});

app.post('/api/admin/contracts/:id/sign', requireAuth, (req, res) => {
  const contractId = req.params.id;
  const { role, signature_data } = req.body;

  db.get(`SELECT * FROM contracts WHERE id = ?`, [contractId], (err, contract) => {
    if (!contract) return res.status(404).json({ code: "40400", msg: "Contract not found" });

    if (currentUser.role === 'insurance' && contract.insurance_company !== currentUser.company_id) {
      return res.status(403).json({ code: "40300", msg: "无权签署此合约" });
    }
    if (currentUser.role === 'hospital' && contract.hospital_code !== currentUser.hospital_code) {
      return res.status(403).json({ code: "40300", msg: "无权签署此合约" });
    }

    let updateSql = '';
    let newStatus = contract.status;

    if (role === 'hospital') {
      updateSql = `UPDATE contracts SET hospital_signature = ?, status = 'Pending Insurance', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      newStatus = 'Pending Insurance';
    } else if (role === 'insurance') {
      updateSql = `UPDATE contracts SET insurance_signature = ?, status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      newStatus = 'Completed';
    }

    db.run(updateSql, [signature_data, contractId], function(err) {
      if (err) return res.status(500).json({ code: "50000", msg: "Failed to save signature" });
      logAction(currentUser, 'sign', 'contract', contractId, `签署合约: ${contract.hospital_code} - ${newStatus}`);
      db.run(`INSERT INTO contract_audit_trail (contract_id, action, actor_username, actor_role, detail) VALUES (?, ?, ?, ?, ?)`,
        [contractId, `signed_${role}`, currentUser.username, currentUser.role, `签署为${role === 'hospital' ? '医疗机构' : '保险公司'}方`]);
      if (newStatus === 'Completed') {
        db.run(`INSERT INTO contract_audit_trail (contract_id, action, actor_username, actor_role, detail) VALUES (?, 'completed', ?, ?, '双方签署完成，直赔网络已打通')`,
          [contractId, currentUser.username, currentUser.role]);
      }
      console.log(`✍️ 签名已保存！合同状态更新为: ${newStatus}`);
      res.json({ code: "10000", msg: "Signature submitted successfully", new_status: newStatus });
    });
  });
});

// ==========================================
// 🌟 11. 患者数据管理 API
// ==========================================
app.get('/api/admin/patients', requireAuth, (req, res) => {
  let query = `SELECT * FROM patients ORDER BY created_at DESC`;
  let params = [];
  
  if (currentUser.role === 'insurance') {
    query = `SELECT * FROM patients WHERE insurance_company = ? ORDER BY created_at DESC`;
    params = [currentUser.company_id];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.get('/api/admin/patients/:id', requireAuth, (req, res) => {
  db.get(`SELECT * FROM patients WHERE patient_id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ code: "40400", msg: "患者不存在" });
    
    if (currentUser.role === 'insurance' && row.insurance_company !== currentUser.company_id) {
      return res.status(403).json({ code: "40300", msg: "无权访问此患者数据" });
    }
    
    res.json({ code: "10000", data: row });
  });
});

app.post('/api/admin/patients', requireRole(['admin', 'insurance']), (req, res) => {
  const { patient_id, name, name_en, gender, date_of_birth, phone, email, policy_id, insurance_company } = req.body;
  
  if (!patient_id || !name) {
    return res.status(400).json({ code: "40000", msg: "患者ID和姓名为必填项" });
  }
  
  db.run(`INSERT INTO patients (patient_id, name, name_en, gender, date_of_birth, phone, email, policy_id, insurance_company) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [patient_id, name, name_en, gender, date_of_birth, phone, email, policy_id, insurance_company || currentUser.company_id], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "创建失败，患者ID可能已存在" });
    logAction(currentUser, 'create', 'patient', patient_id, `创建患者: ${patient_id} - ${name}`);
    res.json({ code: "10000", msg: "患者创建成功" });
  });
});

// ==========================================
// 🌟 12. 就诊记录管理 API
// ==========================================
app.get('/api/admin/visits', requireAuth, (req, res) => {
  let query = `SELECT v.*, p.name as patient_name FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id ORDER BY visit_date DESC`;
  let params = [];
  
  if (currentUser.role === 'insurance') {
    query = `SELECT v.*, p.name as patient_name FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id WHERE p.insurance_company = ? ORDER BY visit_date DESC`;
    params = [currentUser.company_id];
  } else if (currentUser.role === 'hospital') {
    query = `SELECT v.*, p.name as patient_name FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id WHERE v.hospital_code = ? ORDER BY visit_date DESC`;
    params = [currentUser.hospital_code];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

app.get('/api/admin/visits/:patient_id', requireAuth, (req, res) => {
  db.all(`SELECT v.*, p.name as patient_name FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id WHERE v.patient_id = ? ORDER BY visit_date DESC`, 
    [req.params.patient_id], (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

// ==========================================
// 🌟 13. 二维码签到 API
// ==========================================
function generateQRCode(hospital_code) {
  return `HKEDGE_QR_${hospital_code}_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

app.post('/api/admin/qrcode/generate', requireRole(['admin', 'insurance', 'hospital']), (req, res) => {
  const { hospital_code } = req.body;
  const qr_code = generateQRCode(hospital_code || currentUser.hospital_code || 'H001');
  
  db.run(`INSERT INTO qr_checkins (qr_code, hospital_code) VALUES (?, ?)`, 
    [qr_code, hospital_code || currentUser.hospital_code || 'H001'], function(err) {
    if (err) return res.status(500).json({ code: "50000", msg: "生成失败" });
    logAction(currentUser, 'generate_qr', 'qr_checkin', qr_code, `生成签到二维码: ${qr_code}`);
    res.json({ code: "10000", msg: "二维码生成成功", data: { qr_code, hospital_code: hospital_code || currentUser.hospital_code } });
  });
});

app.post('/api/admin/qrcode/checkin', requireAuth, (req, res) => {
  const { qr_code, patient_id } = req.body;
  
  db.get(`SELECT * FROM qr_checkins WHERE qr_code = ?`, [qr_code], (err, qr) => {
    if (!qr) return res.status(404).json({ code: "40400", msg: "二维码不存在" });
    if (qr.status !== 'unused') return res.status(400).json({ code: "40000", msg: "二维码已使用或已过期" });
    
    db.get(`SELECT * FROM patients WHERE patient_id = ?`, [patient_id], (err, patient) => {
      if (!patient) return res.status(404).json({ code: "40400", msg: "患者不存在" });
      
      db.run(`UPDATE qr_checkins SET patient_id = ?, patient_name = ?, status = 'used', checked_in_at = CURRENT_TIMESTAMP WHERE qr_code = ?`, 
        [patient_id, patient.name, qr_code], function(err) {
        if (err) return res.status(500).json({ code: "50000", msg: "签到失败" });
        logAction(currentUser, 'checkin', 'qr_checkin', qr_code, `患者签到: ${patient_id} - ${patient.name}`);
        res.json({ code: "10000", msg: "签到成功", data: { patient_id, patient_name: patient.name, hospital_code: qr.hospital_code } });
      });
    });
  });
});

app.get('/api/admin/qrcode/history', requireAuth, (req, res) => {
  let query = `SELECT q.*, h.hospital_name FROM qr_checkins q LEFT JOIN hospitals h ON q.hospital_code = h.hospital_code ORDER BY created_at DESC LIMIT 50`;
  let params = [];
  
  if (currentUser.role === 'hospital') {
    query = `SELECT q.*, h.hospital_name FROM qr_checkins q LEFT JOIN hospitals h ON q.hospital_code = h.hospital_code WHERE q.hospital_code = ? ORDER BY created_at DESC LIMIT 50`;
    params = [currentUser.hospital_code];
  }
  
  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

// ==========================================
// 🌟 14. 数据看板 API (角色过滤)
// ==========================================
app.get('/api/admin/dashboard', requireAuth, (req, res) => {
  const role = currentUser.role;
  const hc = currentUser.hospital_code;
  const ci = currentUser.company_id;

  const result = { summary: {}, recent_contracts: [], recent_visits: [], recent_claims: [], connected_entities: [] };

  const contractWhere = role === 'hospital' ? `WHERE hospital_code = '${hc}'` : role === 'insurance' ? `WHERE insurance_company = '${ci}'` : '';
  const visitWhere = role === 'hospital' ? `WHERE v.hospital_code = '${hc}'` : role === 'insurance' ? `WHERE p.insurance_company = '${ci}'` : '';
  const claimWhere = role === 'hospital' ? `WHERE hospital_code = '${hc}'` : role === 'insurance' ? `WHERE hospital_code IN (SELECT hospital_code FROM data_flows WHERE insurance_company = '${ci}')` : '';
  const flowWhere = role === 'hospital' ? `WHERE hospital_code = '${hc}'` : role === 'insurance' ? `WHERE insurance_company = '${ci}'` : '';
  const qrWhere = role === 'hospital' ? `WHERE hospital_code = '${hc}' AND status = 'used'` : '';

  db.all(`SELECT status, COUNT(*) as cnt FROM contracts ${contractWhere} GROUP BY status`, [], (err, statusRows) => {
    let pending = 0, completed = 0, total = 0;
    (statusRows || []).forEach(r => { total += r.cnt; if (r.status === 'Completed') completed = r.cnt; else pending += r.cnt; });
    result.summary.contracts_total = total;
    result.summary.contracts_pending = pending;
    result.summary.contracts_completed = completed;
    result.summary.contracts_pending_percent = total > 0 ? Math.round((pending / total) * 100) : 0;
    result.summary.contracts_completed_percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    db.get(`SELECT COUNT(*) as cnt FROM data_flows ${flowWhere}`, [], (err, flowRow) => {
      result.summary.data_flows = flowRow?.cnt || 0;

      db.get(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total_amt FROM claims ${claimWhere}`, [], (err, claimRow) => {
        result.summary.claims_total = claimRow?.cnt || 0;
        result.summary.claims_amount = claimRow?.total_amt || 0;

        db.get(`SELECT COUNT(*) as cnt FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id ${visitWhere}`, [], (err, visitRow) => {
          result.summary.visits_total = visitRow?.cnt || 0;

          db.get(`SELECT COUNT(*) as cnt FROM patients ${role === 'insurance' ? `WHERE insurance_company = '${ci}'` : ''}`, [], (err, patientRow) => {
            result.summary.patients_total = patientRow?.cnt || 0;

            db.get(`SELECT COUNT(*) as cnt, COUNT(DISTINCT data_space_id) as spaces FROM hospitals ${role === 'hospital' ? `WHERE hospital_code = '${hc}'` : ''}`, [], (err, hospitalRow) => {
              result.summary.hospitals_total = hospitalRow?.cnt || 0;
              result.summary.data_spaces_total = hospitalRow?.spaces || 0;

              db.get(`SELECT COUNT(*) as cnt FROM qr_checkins ${qrWhere}`, [], (err, qrRow) => {
                result.summary.qrcode_checkins = qrRow?.cnt || 0;

                const settledWhere = claimWhere ? `${claimWhere} AND status = 'Settled'` : `WHERE status = 'Settled'`;
              db.get(`SELECT COUNT(*) as cnt FROM claims ${settledWhere}`, [], (err, settledRow) => {
                  const settled = settledRow?.cnt || 0;
                  const claimsCnt = result.summary.claims_total;
                  result.summary.claims_success_rate = claimsCnt > 0 ? Math.round((settled / claimsCnt) * 100) : 0;

                  db.all(`SELECT id, hospital_code, hospital_name, insurance_company, status, created_at FROM contracts ${contractWhere} ORDER BY created_at DESC LIMIT 5`, [], (err, rc) => {
                    result.recent_contracts = rc || [];

                    db.all(`SELECT v.*, p.name as patient_name FROM visits v LEFT JOIN patients p ON v.patient_id = p.patient_id ${visitWhere} ORDER BY visit_date DESC LIMIT 5`, [], (err, rv) => {
                      result.recent_visits = rv || [];

                      db.all(`SELECT * FROM claims ${claimWhere} ORDER BY created_at DESC LIMIT 5`, [], (err, rcl) => {
                        result.recent_claims = rcl || [];

                        if (role === 'hospital') {
                          db.all(`SELECT insurance_company FROM data_flows WHERE hospital_code = ?`, [hc], (err, rows) => {
                            result.connected_entities = (rows || []).map(r => r.insurance_company);
                            res.json({ code: "10000", data: result });
                          });
                        } else if (role === 'insurance') {
                          db.all(`SELECT h.hospital_code, h.hospital_name FROM data_flows df JOIN hospitals h ON df.hospital_code = h.hospital_code WHERE df.insurance_company = ?`, [ci], (err, rows) => {
                            result.connected_entities = rows || [];
                            res.json({ code: "10000", data: result });
                          });
                        } else {
                          res.json({ code: "10000", data: result });
                        }
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// ==========================================
// 🌟 15. 理赔记录 API (角色过滤)
// ==========================================
app.get('/api/admin/claims', requireAuth, (req, res) => {
  let query = `SELECT * FROM claims ORDER BY created_at DESC`;
  let params = [];

  if (currentUser.role === 'hospital') {
    query = `SELECT * FROM claims WHERE hospital_code = ? ORDER BY created_at DESC`;
    params = [currentUser.hospital_code];
  } else if (currentUser.role === 'insurance') {
    query = `SELECT * FROM claims WHERE hospital_code IN (SELECT hospital_code FROM data_flows WHERE insurance_company = ?) ORDER BY created_at DESC`;
    params = [currentUser.company_id];
  }

  db.all(query, params, (err, rows) => {
    res.json({ code: "10000", data: rows });
  });
});

// ==========================================
// 🌟 16. 合约审计轨迹 API
// ==========================================
app.get('/api/admin/contracts/:id/audit-trail', requireAuth, (req, res) => {
  const contractId = req.params.id;

  db.get(`SELECT * FROM contracts WHERE id = ?`, [contractId], (err, contract) => {
    if (!contract) return res.status(404).json({ code: "40400", msg: "合约不存在" });

    if (currentUser.role === 'insurance' && contract.insurance_company !== currentUser.company_id) {
      return res.status(403).json({ code: "40300", msg: "无权访问" });
    }
    if (currentUser.role === 'hospital' && contract.hospital_code !== currentUser.hospital_code) {
      return res.status(403).json({ code: "40300", msg: "无权访问" });
    }

    db.all(`SELECT * FROM contract_audit_trail WHERE contract_id = ? ORDER BY created_at ASC`, [contractId], (err, rows) => {
      res.json({ code: "10000", data: rows || [] });
    });
  });
});

// ==========================================
// 🌟 17. 医院出站数据 API (数据发送到数据空间)
// ==========================================
app.get('/api/hospital/outbound-data', requireRole(['admin', 'hospital']), (req, res) => {
  const hospital_code = currentUser.hospital_code;
  
  if (currentUser.role === 'hospital' && !hospital_code) {
    return res.status(403).json({ code: "40300", msg: "医院用户未绑定医院编码" });
  }
  
  const result = {
    hospital_code,
    data_space_id: null,
    data_flows: [],
    recent_visits: [],
    recent_claims: [],
    pending_contracts: []
  };
  
  db.get(`SELECT data_space_id FROM hospitals WHERE hospital_code = ?`, [hospital_code], (err, hospital) => {
    result.data_space_id = hospital?.data_space_id || null;
    
    db.all(`SELECT df.*, h.hospital_name FROM data_flows df 
            LEFT JOIN hospitals h ON df.hospital_code = h.hospital_code 
            WHERE df.hospital_code = ?`, [hospital_code], (err, flows) => {
      result.data_flows = flows || [];
      
      db.all(`SELECT v.*, p.name as patient_name FROM visits v 
              LEFT JOIN patients p ON v.patient_id = p.patient_id 
              WHERE v.hospital_code = ? 
              ORDER BY v.visit_date DESC LIMIT 20`, [hospital_code], (err, visits) => {
        result.recent_visits = visits || [];
        
        db.all(`SELECT * FROM claims WHERE hospital_code = ? ORDER BY created_at DESC LIMIT 20`, [hospital_code], (err, claims) => {
          result.recent_claims = claims || [];
          
          db.all(`SELECT * FROM contracts WHERE hospital_code = ? AND status != 'Completed' ORDER BY created_at DESC`, [hospital_code], (err, contracts) => {
            result.pending_contracts = contracts || [];
            
            res.json({ code: "10000", data: result });
          });
        });
      });
    });
  });
});

// ==========================================
// 🌟 18. 保险公司入站数据 API (即将发送给保险公司的数据)
// ==========================================
app.get('/api/insurance/inbound-data', requireRole(['admin', 'insurance']), (req, res) => {
  const company_id = currentUser.company_id;
  
  if (currentUser.role === 'insurance' && !company_id) {
    return res.status(403).json({ code: "40300", msg: "保司用户未绑定保险公司" });
  }
  
  const result = {
    insurance_company: company_id,
    connected_hospitals: [],
    pending_claims: [],
    recent_visits: [],
    pending_contracts: [],
    completed_contracts: []
  };
  
  db.all(`SELECT h.hospital_code, h.hospital_name, h.data_space_id, df.* 
          FROM data_flows df 
          JOIN hospitals h ON df.hospital_code = h.hospital_code 
          WHERE df.insurance_company = ?`, [company_id], (err, hospitals) => {
    result.connected_hospitals = hospitals || [];
    
    db.all(`SELECT c.*, h.hospital_name FROM claims c
            LEFT JOIN hospitals h ON c.hospital_code = h.hospital_code
            WHERE c.hospital_code IN (SELECT hospital_code FROM data_flows WHERE insurance_company = ?)
            ORDER BY c.created_at DESC LIMIT 20`, [company_id], (err, claims) => {
      result.pending_claims = (claims || []).filter(c => c.status !== 'Settled');
      
      db.all(`SELECT v.*, p.name as patient_name, h.hospital_name FROM visits v
              LEFT JOIN patients p ON v.patient_id = p.patient_id
              LEFT JOIN hospitals h ON v.hospital_code = h.hospital_code
              WHERE v.hospital_code IN (SELECT hospital_code FROM data_flows WHERE insurance_company = ?)
              ORDER BY v.visit_date DESC LIMIT 20`, [company_id], (err, visits) => {
        result.recent_visits = visits || [];
        
        db.all(`SELECT * FROM contracts WHERE insurance_company = ? AND status != 'Completed' ORDER BY created_at DESC`, [company_id], (err, pending) => {
          result.pending_contracts = pending || [];
          
          db.all(`SELECT * FROM contracts WHERE insurance_company = ? AND status = 'Completed' ORDER BY updated_at DESC LIMIT 10`, [company_id], (err, completed) => {
            result.completed_contracts = completed || [];
            
            res.json({ code: "10000", data: result });
          });
        });
      });
    });
  });
});

// ==========================================
// 🌟 19. 数据空间数据统计 API
// ==========================================
app.get('/api/admin/data-space-stats', requireRole(['admin']), (req, res) => {
  const { space_id } = req.query;
  
  let query = `
    SELECT h.hospital_code, h.hospital_name, h.data_space_id,
           COUNT(DISTINCT v.visit_id) as visit_count,
           COUNT(DISTINCT c.id) as claim_count,
           COALESCE(SUM(c.total_amount), 0) as total_amount,
           COUNT(DISTINCT CASE WHEN ct.status = 'Completed' THEN ct.id END) as completed_contracts
    FROM hospitals h
    LEFT JOIN visits v ON h.hospital_code = v.hospital_code
    LEFT JOIN claims c ON h.hospital_code = c.hospital_code
    LEFT JOIN contracts ct ON h.hospital_code = ct.hospital_code
  `;
  let params = [];
  
  if (space_id) {
    query += ` WHERE h.data_space_id = ?`;
    params = [space_id];
  }
  
  query += ` GROUP BY h.hospital_code ORDER BY h.hospital_code`;
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ code: "50000", msg: "查询失败" });
    res.json({ code: "10000", data: rows || [] });
  });
});

// 托管前端静态文件
app.use('/', express.static('public')); 

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 HKEdge Server is running on port ${PORT}`);
  console.log(`=========================================`);
});