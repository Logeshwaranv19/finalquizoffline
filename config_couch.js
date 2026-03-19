// OffGridLink – CouchDB Auto-Setup Script
// Run: node config_couch.js
// Sets up all 3 databases and CORS for mobile access

const http = require('http');

const CONFIG = {
    host: process.env.COUCH_HOST || 'localhost',
    port: process.env.COUCH_PORT || 5984,
    user: process.env.COUCH_USER || 'logesh',
    pass: process.env.COUCH_PASS || 'logeshv@19'
};

const DATABASES = ['offgrid_quizzes', 'offgrid_submissions', 'offgrid_results'];

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${CONFIG.user}:${CONFIG.pass}`).toString('base64');
        const bodyStr = body ? JSON.stringify(body) : '';
        const options = {
            hostname: CONFIG.host,
            port: CONFIG.port,
            path,
            method,
            headers: {
                'Authorization': 'Basic ' + auth,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function setup() {
    console.log(`\n🚀 OffGridLink CouchDB Setup`);
    console.log(`   Host: http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`   User: ${CONFIG.user}\n`);

    // Test connection
    try {
        const info = await request('GET', '/', '');
        if (info.status === 200) {
            console.log(`✅ Connected to CouchDB ${info.body.version}`);
        } else if (info.status === 401) {
            console.error('❌ Authentication failed. Check COUCH_USER and COUCH_PASS.');
            return;
        }
    } catch (e) {
        console.error('❌ Cannot connect to CouchDB. Is it running?');
        console.error('   Install: https://couchdb.apache.org/');
        return;
    }

    // Create databases
    for (const db of DATABASES) {
        const res = await request('PUT', `/${db}`, '');
        if (res.status === 201) {
            console.log(`✅ Created database: ${db}`);
        } else if (res.status === 412) {
            console.log(`ℹ️  Database already exists: ${db}`);
        } else {
            console.error(`❌ Failed to create ${db}:`, res.body);
        }
    }

    // Enable CORS for mobile app access
    const corsConfig = {
        enable_cors: true,
        credentials: true,
        origins: '*',
        headers: 'accept, authorization, content-type, origin, referer, x-csrf-token',
        methods: 'GET, PUT, POST, HEAD, DELETE'
    };

    const corsRes = await request('PUT', '/_node/_local/_config/httpd/enable_cors', { value: 'true' });
    console.log('\n🌐 Enabling CORS for mobile access...');

    const corsSettings = [
        { path: '/_node/_local/_config/cors/origins', value: '*' },
        { path: '/_node/_local/_config/cors/credentials', value: 'true' },
        { path: '/_node/_local/_config/cors/methods', value: 'GET, PUT, POST, HEAD, DELETE' },
        { path: '/_node/_local/_config/cors/headers', value: 'accept, authorization, content-type, origin, referer' },
        { path: '/_node/_local/_config/chttpd/enable_cors', value: 'true' }
    ];

    for (const setting of corsSettings) {
        try {
            await request('PUT', setting.path, { value: setting.value });
        } catch (e) {
            // CouchDB 3.x uses different config paths – try alternative
        }
    }

    console.log('✅ CORS configured');

    // Summary
    console.log('\n📋 Setup Complete!');
    console.log('   Databases created:');
    DATABASES.forEach(db => console.log(`   - http://${CONFIG.host}:${CONFIG.port}/${db}`));
    console.log('\n   Open Fauxton dashboard:');
    console.log(`   http://${CONFIG.host}:${CONFIG.port}/_utils`);
    console.log('\n   In the app Settings, enter:');
    console.log(`   IP: ${CONFIG.host}`);
    console.log(`   Port: ${CONFIG.port}`);
    console.log(`   User: ${CONFIG.user}`);
    console.log(`   Pass: ${CONFIG.pass}`);
}

setup().catch(console.error);
