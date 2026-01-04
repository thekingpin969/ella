import Database from './src/db/mongodb/mongodb';

async function test() {
    const db = new Database();
    // basic check to see if methods are accessible and typed
    try {
        await db.setDB();
    } catch (e) {
        // expected to fail connection in this env
        console.log("Connection failed as expected (no credentials)");
    }
}
test();
