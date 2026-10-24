import {createInterface} from 'node:readline';
import {writeFile,readFile} from 'node:fs/promises';
// Credentials arrive on hidden stdin and are never logged or included in command arguments.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const rl=createInterface({input:process.stdin,terminal:false});
console.log('Ready for FalkorDB connection JSON on stdin. Input is not echoed.');
const line=await new Promise(resolve=>rl.once('line',resolve));rl.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);
const config=JSON.parse(line);
try {
  const response=await fetch(config.browserUrl.replace(/\/$/,'')+'/api/auth/tokens/credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:config.username,password:config.password,host:config.host,port:String(config.port),tls:'true'}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){console.log(JSON.stringify({connected:false,status:response.status}));process.exit(1);}
  let result;try{result=await response.json();}catch{console.log(JSON.stringify({connected:false,error:'Browser authentication returned non-JSON.'}));process.exit(1);}
  if(!result.token){console.log(JSON.stringify({connected:false,error:'No token returned.'}));process.exit(1);}
  const status=await fetch(config.browserUrl.replace(/\/$/,'')+'/api/status',{headers:{Authorization:'Bearer '+result.token},signal:AbortSignal.timeout(30000)});
  if(!status.ok){console.log(JSON.stringify({connected:false,status:status.status}));process.exit(1);}
  let previous='';try{previous=await readFile('.env.local','utf8');}catch{}
  const lines=previous.split(/\r?\n/).filter(l=>!/^FALKORDB_(BROWSER_URL|TOKEN)=/.test(l));
  lines.push('FALKORDB_BROWSER_URL='+config.browserUrl,'FALKORDB_TOKEN='+result.token);
  await writeFile('.env.local',lines.join('\n')+'\n',{mode:0o600});
  console.log(JSON.stringify({connected:true,credentialsSaved:'ignored .env.local',secretsLogged:false}));
}catch{console.log(JSON.stringify({connected:false,error:'Could not reach the Browser REST API.'}));process.exit(1);}
