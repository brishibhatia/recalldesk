const deadline=Date.now()+60000;
while(Date.now()<deadline){try{if((await fetch("http://localhost:3000/api/health")).ok)process.exit(0);}catch{}await new Promise(r=>setTimeout(r,1000));}
throw new Error("RecallDesk did not become healthy within 60 seconds");
