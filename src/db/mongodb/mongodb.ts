import { MongoClient, Db, Filter, Document, Sort, UpdateFilter, OptionalUnlessRequiredId } from "mongodb";

const mongoUser = process.env.MONGO_DB_USER
const mongoPass = process.env.MONGO_DB_PASS
const mongodb = process.env.MONGO_DB_DB

let database: Db;

class Database {

    async setDB() {
        const url = `mongodb+srv://${mongoUser}:${mongoPass}@cluster0.ywsn7md.mongodb.net/`;
        const client = new MongoClient(url);
        await client.connect();
        const mongoDb = client.db(mongodb);
        database = mongoDb;
        console.log('mongoDB setup complete');
        return 'mongoDB setup complete';
    }

    async updateLog(body: { data?: any, id?: Filter<Document> }, collectionName: string, upsert = true) {
        try {
            const { data = {}, id = {} } = body;
            const collection = database.collection(collectionName);
            const result = await collection.updateMany(id, { $set: data }, { upsert: upsert });
            return result;
        } catch (error) {
            console.error('Error updating log:', error);
            throw error;
        }
    }

    async getLogs(query: Filter<Document> = {}, collectionName: string, sort: Sort = {}, limit = 100, skip = 0) {
        try {
            const collection = database.collection(collectionName);
            const data = await collection.find(query).sort(sort).skip(skip).limit(limit).toArray();
            return data ? { success: true, data } : { success: false, data: {} };
        } catch (error) {
            console.error('Error getting logs:', error);
            throw error;
        }
    }

    async addLogs(body: OptionalUnlessRequiredId<Document>, collectionName: string) {
        const data = body ?? {};
        const collection = database.collection(collectionName);
        const res = await collection.insertOne(data);
        return res;
    }

    async clearLogs(id: Filter<Document> = {}, collectionName: string, clearAll = false) {
        const collection = database.collection(collectionName);
        const res = clearAll ? await collection.deleteMany(id) : await collection.deleteOne(id);
        return res;
    }

    async createCollection(collectionName: string) {
        return await database.createCollection(collectionName);
    }

    async countDocuments(id: Filter<Document> = {}, collectionName: string) {
        const collection = database.collection(collectionName);
        const count = await collection.countDocuments(id);
        return count;
    }

    async calculateSum({ match = {}, fieldName, collectionName }: { match?: Filter<Document>, fieldName: string, collectionName: string }) {
        const collection = database.collection(collectionName);
        const sum = await collection.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: `$${fieldName}` } } }
        ]).toArray();

        return sum;
    }

    async aggregate(query: Document[] = [], collectionName: string) {
        const collection = database.collection(collectionName);
        const result = await collection.aggregate(query).toArray();

        return result
    }

    async collection(collectionName: string) {
        return database.collection(collectionName);
    }
}

export default Database