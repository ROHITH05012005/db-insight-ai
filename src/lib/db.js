// Using global initSqlJs from script tag in index.html
const initSqlJs = window.initSqlJs;

let SQL = null;

export const initDB = async () => {
  console.log("DB: initDB called");
  if (SQL) return SQL;
  console.log("DB: Starting initSqlJs...");
  SQL = await initSqlJs({
    locateFile: file => {
      const url = `/${file}`;
      console.log(`DB: Locating WASM file: ${file} -> ${url}`);
      return url;
    }
  });
  console.log("DB: initSqlJs completed");
  return SQL;
};

export const loadDatabase = async (file) => {
  console.log("DB: loadDatabase called for file:", file.name);
  const sql = await initDB();
  const buffer = await file.arrayBuffer();
  console.log("DB: File buffer loaded, size:", buffer.byteLength);
  const database = new sql.Database(new Uint8Array(buffer));
  console.log("DB: Database object created");
  return database;
};

export const getSchema = (db) => {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  if (tables.length === 0) return "No tables found.";

  let schema = "";
  tables[0].values.forEach(([tableName]) => {
    const columns = db.exec(`PRAGMA table_info(${tableName});`);
    schema += `Table: ${tableName}\nColumns: `;
    schema += columns[0].values.map(v => `${v[1]} (${v[2]})`).join(", ");
    schema += "\n\n";
  });
  return schema;
};

export const runQuery = (db, sql) => {
  try {
    const res = db.exec(sql);
    if (res.length === 0) return { columns: [], values: [] };
    return {
      columns: res[0].columns,
      values: res[0].values
    };
  } catch (err) {
    throw new Error(err.message);
  }
};
