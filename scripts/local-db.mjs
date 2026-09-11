import {DatabaseSync} from 'node:sqlite';
export function sqliteBinding(path=':memory:'){
 const db=new DatabaseSync(path);
 return {prepare(sql){let args=[];const p={bind(...values){args=values;return p},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}}};return p},close(){db.close()}};
}
