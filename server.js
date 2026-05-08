import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import pg from 'pg';
import Groq from "groq-sdk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper for SQL.js (WASM)
async function runSqlJs(dbPath, sql, params = []) {
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    try {
        const results = [];
        const res = db.exec(sql, params);
        if (res.length > 0) {
            const columns = res[0].columns;
            const values = res[0].values;
            for (const row of values) {
                const obj = {};
                columns.forEach((col, i) => obj[col] = row[i]);
                results.push(obj);
            }
        }
        // If it's a modification, save back to disk
        if (sql.match(/UPDATE|INSERT|DELETE|CREATE|DROP|ALTER/i)) {
            const data = db.export();
            fs.writeFileSync(dbPath, Buffer.from(data));
        }
        return results;
    } finally {
        db.close();
    }
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let currentDbConfig = null; // { type: 'sqlite', path: '...' } OR { type: 'postgres', url: '...' }

// --- Universal Query Runner ---
const runQuery = async (config, sql) => {
    if (config.type === 'sqlite') {
        const rows = await runSqlJs(config.path, sql, params);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const values = rows.map(row => Object.values(row));
        return { columns, values, raw: rows };
    } else if (config.type === 'postgres') {
        const client = new pg.Client({ connectionString: config.url });
        await client.connect();
        try {
            const res = await client.query(sql);
            const rows = res.rows;
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            const values = rows.map(row => Object.values(row));
            return { columns, values, raw: rows };
        } finally {
            await client.end();
        }
    }
};

// --- Universal Schema Fetcher ---
const getSchema = async (config, tableNames = []) => {
    if (config.type === 'sqlite') {
        const query = tableNames.length > 0 
            ? `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${tableNames.map(t => `'${t}'`).join(',')})`
            : "SELECT name FROM sqlite_master WHERE type='table'";

        const tables = await runSqlJs(config.path, query);
        let schema = "";
        for (const table of tables) {
            const tableName = table.name;
            const info = await runSqlJs(config.path, `PRAGMA table_info(${tableName})`);
            schema += `Table: ${tableName}\\nColumns: ${info.map(c => `${c.name} (${c.type})`).join(", ")}\\n\\n`;
        }
        return schema;
    } else if (config.type === 'postgres') {
        const client = new pg.Client({ connectionString: config.url });
        await client.connect();
        try {
            const tableQuery = tableNames.length > 0
                ? `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_name = ANY($1) LIMIT 50`
                : `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') LIMIT 50`;
            
            const params = tableNames.length > 0 ? [tableNames] : [];
            const tablesRes = await client.query(tableQuery, params);
            
            let schema = "";
            for (const table of tablesRes.rows) {
                const schemaName = table.table_schema;
                const tableName = table.table_name;
                const colsRes = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [schemaName, tableName]);
                schema += `Table: ${schemaName}.${tableName}\\nColumns: ${colsRes.rows.map(c => `${c.column_name} (${c.data_type})`).join(", ")}\\n\\n`;
            }
            return schema;
        } finally {
            await client.end();
        }
    }
};

// --- Universal Table Fetcher ---
const getAllTableNames = async (config) => {
    if (config.type === 'sqlite') {
        const tables = await runSqlJs(config.path, "SELECT name FROM sqlite_master WHERE type='table'");
        return tables.map(t => t.name);
    } else if (config.type === 'postgres') {
        const client = new pg.Client({ connectionString: config.url });
        await client.connect();
        try {
            const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') LIMIT 50`);
            return res.rows.map(r => r.table_name);
        } finally {
            await client.end();
        }
    }
    return [];
};

// Helper: Identify relevant tables using AI
const getRelevantTables = async (config, prompt, history) => {
    try {
        const tableNames = await getAllTableNames(config);
        const tableList = tableNames.join(", ");
        
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a database architect. Given a list of tables and a user question, identify which tables are RELEVANT.
                             TABLES: ${tableList}
                             CONTEXT: If the question is a follow-up, look at the previous SQL queries to see which tables were used.
                             RULES: Return ONLY a comma-separated list of table names. No explanation.`
                },
                ...history.slice(-4).map(m => {
                    let content = m.content;
                    if (m.role === 'assistant' && m.query) content += `\\n(SQL: ${m.query})`;
                    return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
                }),
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const selected = completion.choices[0].message.content.split(',').map(t => t.trim());
        const finalTables = selected.filter(t => tableList.includes(t));
        console.log("Selected Tables:", finalTables);
        return finalTables;
    } catch (e) {
        console.error("Table Picker Error:", e);
        return []; 
    }
};

// Route: Connect via Connection String
app.post('/api/connect', async (req, res) => {
    try {
        const { connectionString } = req.body;
        if (!connectionString) return res.status(400).send('No connection string provided.');
        
        if (connectionString.startsWith('sqlite://')) {
            const dbPath = connectionString.replace('sqlite://', '');
            if (!fs.existsSync(dbPath)) return res.status(400).json({ error: 'Database file not found at that path.' });
            currentDbConfig = { type: 'sqlite', path: dbPath };
        } else if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
            currentDbConfig = { type: 'postgres', url: connectionString };
        } else {
            return res.status(400).json({ error: 'Unsupported connection string. Use sqlite:// or postgresql://' });
        }

        const schema = await getSchema(currentDbConfig);
        
        res.json({ 
            message: 'Connected to live database successfully!', 
            schema: schema,
            fileName: currentDbConfig.type === 'sqlite' ? path.basename(currentDbConfig.path) : 'PostgreSQL Database'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: Upload DB
app.post('/api/upload', upload.single('database'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded.');
        
        currentDbConfig = { type: 'sqlite', path: req.file.path };
        const schema = await getSchema(currentDbConfig);
        
        res.json({ 
            message: 'Database loaded successfully!', 
            schema: schema,
            fileName: req.file.originalname 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: Query DB
app.post('/api/query', async (req, res) => {
    const { prompt, history = [] } = req.body;

    if (!currentDbConfig) return res.status(400).json({ error: 'No database loaded.' });

    try {
        console.log(`\n--- NEW QUERY: "${prompt}" ---`);
        console.log("Analyzing schema relevance...");
        
        const relevantTableNames = await getRelevantTables(currentDbConfig, prompt, history);
        const filteredSchema = await getSchema(currentDbConfig, relevantTableNames);

        console.log("Generating SQL...");

        const chatHistory = history.slice(-6).map(msg => {
            let content = msg.content;
            if (msg.role === 'assistant' && msg.query) content += `\n(SQL: ${msg.query})`;
            return { role: msg.role === 'assistant' ? 'assistant' : 'user', content };
        });

        let sqlQuery = "";
        try {
            const sqlCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are an expert SQL assistant. Convert user question to valid SQLite query.
                                 SCHEMA: ${filteredSchema}
                                 RULES:                                  - Return ONLY the SQL query. 
                                 - DO NOT use markdown code blocks. 
                                 - DO NOT include any conversational text.
                                 - You CAN write UPDATE, INSERT, or DELETE queries if requested.
                                 - If the user asks to change the chart, repeat the LAST SQL query exactly.
                                 - If impossible, return "ERROR: Cannot answer."`
                    },
                    ...chatHistory,
                    { role: "user", content: prompt }
                ],
                model: "llama-3.3-70b-versatile",
            });

            const rawContent = sqlCompletion.choices[0].message.content.trim();
            // Try to extract from markdown first, otherwise take the first valid SQL statement found
            const markdownMatch = rawContent.match(/```(?:sql)?\n?([\s\S]*?)```/i);
            if (markdownMatch) {
                sqlQuery = markdownMatch[1].trim();
            } else {
                const keywordMatch = rawContent.match(/(?:SELECT|UPDATE|INSERT|DELETE|CREATE|DROP|ALTER)[\s\S]+?(?:;|$)/i);
                sqlQuery = keywordMatch ? keywordMatch[0] : rawContent;
            }
            sqlQuery = sqlQuery.trim().replace(/;$/, ''); 
        } catch (e) {
            sqlQuery = "ERROR: Connection failed.";
        }

        // Failsafe Fallback
        if (sqlQuery.startsWith('ERROR') && (prompt.toLowerCase().includes('chart') || prompt.toLowerCase().includes('visual') || prompt.toLowerCase().includes('bar') || prompt.toLowerCase().includes('area'))) {
            const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant' && m.query);
            if (lastAssistantMsg) {
                console.log("FALLBACK TRIGGERED: Re-using last SQL.");
                sqlQuery = lastAssistantMsg.query;
            }
        }

        console.log("Executing SQL:", sqlQuery);

        if (sqlQuery.startsWith('ERROR')) {
            return res.json({ response: sqlQuery });
        }

        // Action Mode Detection (Relaxed start to handle subtle leading noise)
        const isActionQuery = /\b(UPDATE|INSERT|DELETE|DROP|CREATE|ALTER)\b/i.test(sqlQuery.split('\n')[0].trim());
        if (isActionQuery) {
            console.log("Action query detected. Waiting for user confirmation.");
            return res.json({
                response: "I've drafted the command to update your database. Please review the SQL code below and confirm execution.",
                isAction: true,
                query: sqlQuery,
                visualization: { type: 'none' },
                data: null
            });
        }

        const queryResult = await runQuery(currentDbConfig, sqlQuery);
        console.log("Results found:", queryResult.raw.length);

        console.log("Interpreting results...");
        const interpretationCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a data analyst. 
                             1. Summarize the results.
                             2. Suggest a chart configuration.
                             
                             RULES FOR VISUALIZATION JSON:
                             - Must be a valid JSON object.
                             - DO NOT put arrays of data in the JSON. The frontend already has the data.
                             - 'xAxis' and 'yAxis' must be the exact COLUMN NAMES from the SQL query.
                             - Format EXACTLY like this (do not add text after the JSON):
                             
                             [SUMMARY]
                             Your summary here...
                             [VISUALIZATION]
                             {
                               "type": "bar", // bar, line, pie, area, or none
                               "xAxis": "column_name",
                               "yAxis": "column_name",
                               "title": "Chart Title"
                             }`
                },
                ...chatHistory,
                {
                    role: "user",
                    content: `User: "${prompt}"\nSQL: "${sqlQuery}"\nData: ${JSON.stringify(queryResult.raw.slice(0, 10))}`
                }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const fullResponse = interpretationCompletion.choices[0].message.content;
        
        // Robust Parsing: Handle [VISUALIZATION], **VISUALIZATION**, etc.
        let summary = fullResponse;
        let visualization = { type: 'none' };
        
        const vizMatch = fullResponse.match(/(?:\[|\*\*?)VISUALIZATION(?:\]|\*\*?)[\s\S]*?({[\s\S]*})/i);
        
        if (vizMatch) {
            summary = fullResponse.split(/(?:\[|\*\*?)VISUALIZATION(?:\]|\*\*?)/i)[0].replace(/(?:\[|\*\*?)SUMMARY(?:\]|\*\*?)/i, '').trim();
            
            // Extract just the JSON part, ignoring markdown code blocks and trailing text
            let rawVizString = vizMatch[1].replace(/```json|```/gi, '').trim();
            const firstBrace = rawVizString.indexOf('{');
            const lastBrace = rawVizString.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                rawVizString = rawVizString.substring(firstBrace, lastBrace + 1);
                try {
                    const rawViz = JSON.parse(rawVizString);
                    // Normalize keys (handle x, y, xAxis, yAxis, etc.)
                    visualization = {
                        type: (rawViz.type || 'none').toLowerCase(),
                        xAxis: rawViz.xAxis || rawViz.x || rawViz.xaxis || '',
                        yAxis: rawViz.yAxis || rawViz.y || rawViz.yaxis || '',
                        title: rawViz.title || 'Data Visualization'
                    };
                } catch (e) {
                    console.error("Failed to parse visualization JSON:", e);
                }
            }
        } else {
            summary = fullResponse.replace(/(?:\[|\*\*?)SUMMARY(?:\]|\*\*?)/i, '').trim();
        }

        res.json({
            response: summary,
            visualization,
            query: sqlQuery,
            data: {
                columns: queryResult.columns,
                values: queryResult.values,
                raw: queryResult.raw
            }
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Route: Execute Action Query
app.post('/api/execute-action', async (req, res) => {
    const { query } = req.body;
    if (!currentDbConfig) return res.status(400).json({ error: 'No database loaded.' });

    try {
        console.log("User confirmed. Executing Action Query:", query);
        
        let rowsChanged = 0;
        if (currentDbConfig.type === 'sqlite') {
            await runSqlJs(currentDbConfig.path, query);
            rowsChanged = 1; // SQL.js doesn't easily return rowCount for mutations without extra steps, setting to 1 for simplicity
        } else if (currentDbConfig.type === 'postgres') {
            const client = new pg.Client({ connectionString: currentDbConfig.url });
            await client.connect();
            try {
                const resPg = await client.query(query);
                rowsChanged = resPg.rowCount;
            } finally {
                await client.end();
            }
        }
        
        res.json({ message: `Success! Action executed.` });
    } catch (error) {
        console.error("Action Execution Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Deployment: Serve frontend
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
