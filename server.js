const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// 🌟 1. JSON 文件数据库初始化
// ==========================================
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'hkedge.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const defaultData = {
  hospitals: [
    { id: 1, hospital_code: 'H001', hospital_name: '香港大学深圳医院', hospital_name_en: 'HKU-SZH', hospital_name_tc: '香港大學深圳醫院', data_space_id: 'SPACE001', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, hospital_code: 'H002', hospital_name: '北京协和医院', hospital_name_en: 'Peking Union Medical College Hospital', hospital_name_tc: '北京協和醫院', data_space_id: 'SPACE001', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 3, hospital_code: 'H003', hospital_name: '南方医科大学深圳医院', hospital_name_en: 'Southern Medical University Shenzhen Hospital', hospital_name_tc: '南方醫科大學深圳醫院', data_space_id: 'SPACE002', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 4, hospital_code: 'H004', hospital_name: '中山大学附属第一医院', hospital_name_en: 'First Affiliated Hospital of Sun Yat-sen University', hospital_name_tc: '中山大學附屬第一醫院', data_space_id: 'SPACE002', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 5, hospital_code: 'H005', hospital_name: '香港中文大学医院', hospital_name_en: 'CUHK Medical Centre', hospital_name_tc: '香港中文大學醫院', data_space_id: 'SPACE001', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 6, hospital_code: 'H006', hospital_name: '深圳和睦家医院', hospital_name_en: 'Shenzhen United Family Hospital', hospital_name_tc: '深圳和睦家醫院', data_space_id: 'SPACE002', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 7, hospital_code: 'H007', hospital_name: '广州医科大学附属第一医院', hospital_name_en: 'First Affiliated Hospital of Guangzhou Medical University', hospital_name_tc: '廣州醫科大學附屬第一醫院', data_space_id: 'SPACE002', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 8, hospital_code: 'H008', hospital_name: '澳门镜湖医院', hospital_name_en: 'Kiang Wu Hospital', hospital_name_tc: '澳門鏡湖醫院', data_space_id: 'SPACE001', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  users: [
    { id: 1, username: 'admin', password: 'admin123', role: 'admin', company_id: null, hospital_code: null, permissions: '["*"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, username: 'aia_admin', password: 'aia123', role: 'insurance', company_id: 'AIA Hong Kong (友邦)', hospital_code: null, permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 3, username: 'hku_admin', password: 'hku123', role: 'hospital', company_id: null, hospital_code: 'H001', permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 4, username: 'shenzhen_admin', password: 'sz123456', role: 'hospital', company_id: null, hospital_code: 'H003', permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 5, username: 'cuhk_admin', password: 'cuhk123', role: 'hospital', company_id: null, hospital_code: 'H005', permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 6, username: 'macau_admin', password: 'macau123', role: 'hospital', company_id: null, hospital_code: 'H008', permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 7, username: 'aia_operator', password: 'aia123', role: 'insurance', company_id: 'AIA Hong Kong (友邦)', hospital_code: null, permissions: '["read"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 8, username: 'operator', password: 'op123456', role: 'admin', company_id: null, hospital_code: null, permissions: '["read","write"]', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  data_spaces: [
    { id: 1, space_id: 'SPACE001', space_name: '大湾区医疗数据空间', description: '覆盖粤港澳大湾区的医疗数据空间', created_at: new Date().toISOString() },
    { id: 2, space_id: 'SPACE002', space_name: '华南医疗数据空间', description: '覆盖华南地区的医疗数据空间', created_at: new Date().toISOString() }
  ],
  contracts: [
    { id: 1, contract_id: 'CTR20260507001', hospital_code: 'H001', insurance_company: 'AIA Hong Kong (友邦)', contract_type: '医疗直赔', status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, contract_id: 'CTR20260507002', hospital_code: 'H003', insurance_company: 'AIA Hong Kong (友邦)', contract_type: '医疗直赔', status: 'signing', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 3, contract_id: 'CTR20260507003', hospital_code: 'H005', insurance_company: 'AIA Hong Kong (友邦)', contract_type: '医疗直赔', status: 'completed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  patients: [
    { id: 1, patient_id: 'P001', name: '张三', name_en: 'Zhang San', gender: '男', date_of_birth: '1990-01-01', phone: '13800138000', email: 'zhangsan@example.com', policy_id: 'AIA-2026-001', insurance_company: 'AIA Hong Kong (友邦)', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, patient_id: 'P002', name: '李四', name_en: 'Li Si', gender: '女', date_of_birth: '1995-05-15', phone: '13900139000', email: 'lisi@example.com', policy_id: 'AIA-2026-002', insurance_company: 'AIA Hong Kong (友邦)', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  visits: [
    { id: 1, visit_id: 'V001', patient_id: 'P001', hospital_code: 'H001', visit_date: '2026-05-01', diagnosis: '感冒', treatment: '药物治疗', cost: 500, status: 'completed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, visit_id: 'V002', patient_id: 'P002', hospital_code: 'H003', visit_date: '2026-05-05', diagnosis: '体检', treatment: '常规体检', cost: 1500, status: 'completed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  qr_checkins: [],
  chat_records: [],
  signatures: []
};

let db = { ...defaultData };

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = { ...defaultData, ...data };
      console.log('✅ 成功加载数据库');
    } catch (e) {
      console.log('⚠️ 数据库加载失败，使用默认数据:', e.message);
    }
  } else {
    saveDB();
    console.log('✅ 创建新数据库');
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

loadDB();

// ==========================================
// 🌟 2. 用户认证 API
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  
  if (user) {
    res.json({ success: true, user: { ...user, password: undefined } });
  } else {
    res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
});

app.get('/api/auth/user', (req, res) => {
  res.json({ user: db.users[0] });
});

// ==========================================
// 🌟 3. 医院管理 API
// ==========================================
app.get('/api/hospitals', (req, res) => {
  res.json({ hospitals: db.hospitals });
});

app.get('/api/hospitals/:code', (req, res) => {
  const hospital = db.hospitals.find(h => h.hospital_code === req.params.code);
  if (hospital) {
    res.json(hospital);
  } else {
    res.status(404).json({ error: '医院不存在' });
  }
});

app.post('/api/hospitals', (req, res) => {
  const newHospital = {
    id: db.hospitals.length + 1,
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.hospitals.push(newHospital);
  saveDB();
  res.json({ success: true, hospital: newHospital });
});

// ==========================================
// 🌟 4. 数据空间 API
// ==========================================
app.get('/api/data-spaces', (req, res) => {
  res.json({ data_spaces: db.data_spaces });
});

// ==========================================
// 🌟 5. 合约管理 API
// ==========================================
app.get('/api/contracts', (req, res) => {
  res.json({ contracts: db.contracts });
});

app.post('/api/contracts', (req, res) => {
  const newContract = {
    id: db.contracts.length + 1,
    contract_id: `CTR${Date.now()}`,
    ...req.body,
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.contracts.push(newContract);
  saveDB();
  res.json({ success: true, contract: newContract });
});

app.patch('/api/contracts/:id', (req, res) => {
  const idx = db.contracts.findIndex(c => c.id === parseInt(req.params.id));
  if (idx !== -1) {
    db.contracts[idx] = { 
      ...db.contracts[idx], 
      ...req.body, 
      updated_at: new Date().toISOString() 
    };
    saveDB();
    res.json({ success: true, contract: db.contracts[idx] });
  } else {
    res.status(404).json({ error: '合约不存在' });
  }
});

// ==========================================
// 🌟 6. 患者管理 API
// ==========================================
app.get('/api/patients', (req, res) => {
  res.json({ patients: db.patients });
});

app.post('/api/patients', (req, res) => {
  const newPatient = {
    id: db.patients.length + 1,
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.patients.push(newPatient);
  saveDB();
  res.json({ success: true, patient: newPatient });
});

// ==========================================
// 🌟 7. 就诊记录 API
// ==========================================
app.get('/api/visits', (req, res) => {
  res.json({ visits: db.visits });
});

app.post('/api/visits', (req, res) => {
  const newVisit = {
    id: db.visits.length + 1,
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.visits.push(newVisit);
  saveDB();
  res.json({ success: true, visit: newVisit });
});

// ==========================================
// 🌟 8. QR签到 API
// ==========================================
app.get('/api/qr-checkins', (req, res) => {
  res.json({ checkins: db.qr_checkins });
});

app.post('/api/qr-checkins', (req, res) => {
  const newCheckin = {
    id: db.qr_checkins.length + 1,
    ...req.body,
    checkin_time: new Date().toISOString()
  };
  db.qr_checkins.push(newCheckin);
  saveDB();
  res.json({ success: true, checkin: newCheckin });
});

// ==========================================
// 🌟 9. 聊天记录 API
// ==========================================
app.get('/api/chat-records', (req, res) => {
  res.json({ records: db.chat_records });
});

app.post('/api/chat-records', (req, res) => {
  const newRecord = {
    id: db.chat_records.length + 1,
    ...req.body,
    created_at: new Date().toISOString()
  };
  db.chat_records.push(newRecord);
  saveDB();
  res.json({ success: true, record: newRecord });
});

// ==========================================
// 🌟 10. 签名 API
// ==========================================
app.get('/api/signatures', (req, res) => {
  res.json({ signatures: db.signatures });
});

app.post('/api/signatures', (req, res) => {
  const newSignature = {
    id: db.signatures.length + 1,
    ...req.body,
    created_at: new Date().toISOString()
  };
  db.signatures.push(newSignature);
  saveDB();
  res.json({ success: true, signature: newSignature });
});

// ==========================================
// 🌟 11. 首页统计数据
// ==========================================
app.get('/api/dashboard', (req, res) => {
  res.json({
    hospitals_count: db.hospitals.length,
    contracts_count: db.contracts.length,
    patients_count: db.patients.length,
    checkins_count: db.qr_checkins.length,
    active_contracts: db.contracts.filter(c => c.status === 'completed').length,
    pending_contracts: db.contracts.filter(c => c.status === 'signing').length,
    recent_visits: db.visits.slice(-5),
    recent_patients: db.patients.slice(-5)
  });
});

// ==========================================
// 🌟 12. 静态文件服务
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 🚀 启动服务器
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 HKEdge Server 运行在 http://localhost:${PORT}`);
  console.log('✅ 使用 JSON 文件存储，兼容任何平台');
});
