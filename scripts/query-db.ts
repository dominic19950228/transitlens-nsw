import { getDatabasePool } from '../src/database/pool.js';

async function main() {
    const pool = getDatabasePool();
    const conn = await pool.getConnection();
    try {
        const [imports] = await conn.query('SELECT * FROM gtfs_feed_imports ORDER BY id DESC LIMIT 1');
        console.log('Latest import row:');
        console.log(JSON.stringify(imports[0], null, 2));
        
        console.log('\nTable counts:');
        const tables = ['gtfs_feed_imports', 'gtfs_agencies', 'gtfs_routes', 'gtfs_stops', 'gtfs_trips', 'gtfs_stop_times', 'gtfs_calendar'];
        for (const table of tables) {
            const [rows] = await conn.query(`SELECT COUNT(*) as cnt FROM ${table}`);
            console.log(table + ': ' + rows[0].cnt);
        }
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch(console.error);