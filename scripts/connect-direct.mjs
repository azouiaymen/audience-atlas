import {createInterface} from 'node:readline';
import {writeFile,readFile} from 'node:fs/promises';
import {FalkorDB} from 'falkordb';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const rl=createInterface({input:process.stdin,terminal:false});
console.log('Ready for private database connection JSON. Input is not echoed.');
const line=await new Promise(resolve=>rl.once('line',resolve));rl.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);
const c=JSON.parse(line);let db;
try{
  db=await FalkorDB.connect({socket:{host:c.host,port:Number(c.port),tls:true,connectTimeout:15000,reconnectStrategy:false},username:c.username,password:c.password});
  const info=await db.info();
  let previous='';try{previous=await readFile('.env.local','utf8');}catch{}
  const lines=previous.split(/\r?\n/).filter(l=>!/^FALKORDB_(HOST|PORT|USER|PASSWORD|TLS)=/.test(l));
  const entries={FALKORDB_HOST:c.host,FALKORDB_PORT:c.port,FALKORDB_USER:c.username,FALKORDB_PASSWORD:c.password,FALKORDB_TLS:'true'};
  for(const [k,v]of Object.entries(entries))lines.push(k+'='+JSON.stringify(String(v)));
  await writeFile('.env.local',lines.join('\n')+'\n',{mode:0o600});
  console.log(JSON.stringify({connected:true,credentialsSaved:'ignored .env.local',secretsLogged:false}));
}catch(e){console.log(JSON.stringify({connected:false,error:String(e.message||'Direct TLS connection failed.').replaceAll(c.password,'[REDACTED]'),code:e.code||null}));process.exitCode=1;}
finally{if(db)await db.close();}
