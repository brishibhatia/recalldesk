import { readdir,readFile } from "node:fs/promises";
import { join } from "node:path";
const ignored=new Set(["node_modules",".git",".next",".local","test-results","playwright-report","artifacts/live"]);
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsuiprivkey1[a-z0-9]{45,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/,/MEMWAL_DELEGATE_KEY\s*=\s*[a-f0-9]{64}/i];
const failures:string[]=[];let scanned=0;
async function walk(dir:string){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name),relative=path.replace(/^\.\//,"");if(ignored.has(item.name)||ignored.has(relative)||item.name.endsWith(".tsbuildinfo"))continue;if(item.isDirectory()){await walk(path);continue;}if(item.name.startsWith(".env")&&item.name!==".env.example")continue;if(!/\.(?:ts|tsx|js|mjs|json|md|yml|yaml|sql|css|example)$/.test(item.name)&&!["Dockerfile",".gitignore",".dockerignore"].includes(item.name))continue;const contents=await readFile(path,"utf8");scanned++;if(patterns.some(p=>p.test(contents)))failures.push(relative);}}
await walk(".");
console.log(JSON.stringify({scanned,findings:failures,scope:"RecallDesk source and publication artifacts; ignored local env/runtime/live evidence directories"},null,2));if(failures.length)process.exitCode=1;
