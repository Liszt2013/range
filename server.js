const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = 3000;

// 使用cors中间件允许前端访问
app.use(cors());

// 解析JSON请求体
app.use(express.json());

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 使用原始文件名，但可以添加时间戳避免重名
        const originalName = path.parse(file.originalname).name;
        const extension = path.parse(file.originalname).ext;
        cb(null, `${originalName}-${Date.now()}${extension}`);
    }
});

const upload = multer({ 
    storage: storage,
    // 文件过滤：允许所有文件类型
    fileFilter: (req, file, cb) => {
        cb(null, true);
    },
    // 限制文件大小：10MB
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

// 提供静态文件服务
app.use(express.static('public'));
// 提供上传文件的访问
app.use('/uploads', express.static(uploadDir));

// 文件上传接口
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '没有文件上传' });
    }
    
    // 获取文件信息
    const fileInfo = {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        path: req.file.path,
        uploadTime: new Date()
    };
    
    console.log('文件上传成功:', fileInfo);
    
    res.json({
        message: '文件上传成功',
        file: fileInfo
    });
});

// 获取文件列表接口
app.get('/api/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error('读取文件列表错误:', err);
            return res.status(500).json({ error: '无法读取文件列表' });
        }
        
        // 过滤掉隐藏文件，只返回普通文件
        const validFiles = files.filter(file => {
            return fs.statSync(path.join(uploadDir, file)).isFile() && !file.startsWith('.');
        });
        
        const fileList = validFiles.map(file => {
            const filePath = path.join(uploadDir, file);
            const stat = fs.statSync(filePath);
            return {
                name: file,
                originalName: file.split('-').slice(0, -1).join('-'), // 尝试还原原始文件名
                size: stat.size,
                uploadTime: stat.mtime,
                url: `/uploads/${file}`
            };
        });
        
        res.json(fileList);
    });
});

// 删除文件接口
app.delete('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    // 安全检查：防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: '无效的文件名' });
    }
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文件不存在' });
    }
    
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('删除文件错误:', err);
            return res.status(500).json({ error: '删除文件失败' });
        }
        
        res.json({ message: '文件删除成功' });
    });
});

// 下载文件接口
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    // 安全检查
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: '无效的文件名' });
    }
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文件不存在' });
    }
    
    res.download(filePath, (err) => {
        if (err) {
            console.error('下载文件错误:', err);
            res.status(500).json({ error: '下载文件失败' });
        }
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(port, () => {
    console.log(`文件上传靶场服务器运行在 http://localhost:${port}`);
    console.log(`上传文件将保存到: ${uploadDir}`);
    console.log('按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    process.exit(0);

});

// 添加一个管理页面路由
app.get('/admin', (req, res) => {
    const adminKey = req.query.key;
    
    // 简单的密码验证
    if (adminKey !== '130611') {
        return res.status(403).send('访问被拒绝');
    }
    
    // 读取文件列表并显示
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).send('无法读取文件列表');
        }
        
        let fileListHtml = '<h1>上传文件管理</h1><ul>';
        files.forEach(file => {
            fileListHtml += `<li>${file} <a href="/uploads/${file}">下载</a> <a href="/admin/delete?file=${file}&key=130611">删除</a></li>`;
        });
        fileListHtml += '</ul>';
        
        res.send(fileListHtml);
    });
});

// 添加删除功能
app.get('/admin/delete', (req, res) => {
    if (req.query.key !== '130611') {
        return res.status(403).send('访问被拒绝');
    }
    
    const filePath = path.join(uploadDir, req.query.file);
    fs.unlinkSync(filePath);
    res.redirect('/admin?key=130611');
});
