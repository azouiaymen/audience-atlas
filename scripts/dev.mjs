import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
const built=spawnSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});if(built.status)process.exit(built.status);
const {default:worker}=await import('../worker/index.js');
const runtime={...process.env};
if(runtime.FALKORDB_HOST&&runtime.FALKORDB_PASSWORD){
  const {FalkorDB}=await import('falkordb');let client;
  runtime.__falkorQuery=async(graphName,query)=>{
    try{
      if(!client){client=await FalkorDB.connect({socket:{host:runtime.FALKORDB_HOST,servername:runtime.FALKORDB_HOST,port:Number(runtime.FALKORDB_PORT||6379),tls:runtime.FALKORDB_TLS!=='false',connectTimeout:15000,reconnectStrategy:false},username:runtime.FALKORDB_USER||'falkordb',password:runtime.FALKORDB_PASSWORD});client.on('error',()=>{client=undefined;});}
      const result=await client.selectGraph(graphName).query(query,{TIMEOUT:30000});return result.data;
    }catch{client=undefined;throw Object.assign(new Error('Direct FalkorDB query failed. Verify the host, TLS setting and credentials.'),{status:502});}
  };
}
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req){chunks.push(c);if(chunks.reduce((n,c)=>n+c.length,0)>200000){res.writeHead(413);res.end('Input too large');return;}}const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const reply=await worker.fetch(request,runtime);res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));}catch{res.writeHead(500);res.end('Request failed');}});
server.listen(4173,'127.0.0.1',()=>console.log('Audience Atlas → http://localhost:4173'));
