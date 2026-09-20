import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { demoDocuments, renderDemoPdf, refreshDemoDocuments } from "../src/lib/demo-documents.ts";

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "acquire-docs-"));
  mkdirSync(path.join(dir, "uploads"));
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,is_demo INTEGER); CREATE TABLE documents(id TEXT PRIMARY KEY,name TEXT,storage_key TEXT,mime TEXT,size INTEGER,version INTEGER DEFAULT 1,uploaded_by TEXT,audience TEXT,buyer_id TEXT);");
  db.exec("INSERT INTO users VALUES('demo-advisor',1),('demo-buyer',1),('real-user',0)");
  for (const sample of demoDocuments) {
    const name = "Original fixture.txt";
    const body = `ACQUIRE \u2014 FICTIONAL DEMONSTRATION\n${name}\n\nThis file contains no real company or transaction information. It is not a legal agreement, financial statement, or executed signature record. Replace it with your own reviewed documents for a private pilot.\n`;
    writeFileSync(path.join(dir,"uploads",sample.id),body);
    db.prepare("INSERT INTO documents(id,name,storage_key,mime,size,uploaded_by,audience,buyer_id) VALUES(?,?,?,'text/plain',?,?,'buyer','demo-buyer')").run(sample.id,name,sample.id,Buffer.byteLength(body),sample.id.includes("loi")?"demo-buyer":"demo-advisor");
  }
  return { db, dir, close() { db.close(); rmSync(dir,{recursive:true,force:true}); } };
}

test("six deterministic PDFs have valid byte offsets and explicit fictional markings",()=>{
  assert.equal(demoDocuments.length,6);
  for(const doc of demoDocuments){
    const bytes=renderDemoPdf(doc), text=bytes.toString("ascii");
    assert.ok(bytes.equals(renderDemoPdf(doc)));
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.match(text,/FICTIONAL DEMONSTRATION/);
    assert.match(text,/Not advice, an offer, or an executed agreement/);
    const offset=Number(text.match(/startxref\n(\d+)/)[1]);
    assert.equal(text.slice(offset,offset+4),"xref");
    const section=text.slice(offset).split("\n");
    const count=Number(section[1].split(" ")[1]);
    for(let i=1;i<count;i++){
      const objectOffset=Number(section[i+2].slice(0,10));
      assert.equal(text.slice(objectOffset,objectOffset+`${i} 0 obj`.length),`${i} 0 obj`);
    }
    for(const block of doc.blocks.filter(b=>"rows" in b)) {
      assert.equal(block.widths.reduce((a,b)=>a+b,0),506);
      for(const row of block.rows)assert.equal(row.length,block.widths.length);
    }
  }
});

test("financial schedules reconcile and offer consideration totals agree",()=>{
  const table=id=>demoDocuments.find(d=>d.id===id).blocks.find(b=>"rows" in b).rows;
  const n=s=>Number(s.replaceAll(",",""));
  for(const id of ["doc-cedar-fin","doc-summit-fin"]){
    const rows=table(id);
    for(let year=1;year<=3;year++){
      assert.equal(n(rows[1][year])-n(rows[2][year]),n(rows[3][year]));
      assert.equal(n(rows[3][year])-n(rows[4][year]),n(rows[5][year]));
      assert.equal(n(rows[5][year])+n(rows[6][year]),n(rows[7][year]));
    }
  }
  const offer=demoDocuments.find(d=>d.id==="doc-summit-loi").blocks.filter(b=>"rows" in b)[1].rows;
  assert.equal(offer.slice(1,4).reduce((sum,row)=>sum+n(row[1]),0),n(offer[4][1]));
});

test("placeholder upgrade preserves document IDs, audiences and buyer scope, and is idempotent",()=>{
  const f=fixture();try{
    assert.equal(refreshDemoDocuments(f.db,f.dir),6);
    for(const doc of f.db.prepare("SELECT * FROM documents").all()){
      assert.equal(doc.mime,"application/pdf");assert.equal(doc.version,2);
      assert.equal(doc.audience,"buyer");assert.equal(doc.buyer_id,"demo-buyer");
      assert.equal(readFileSync(path.join(f.dir,"uploads",doc.storage_key)).length,doc.size);
    }
    assert.equal(refreshDemoDocuments(f.db,f.dir),0);
  }finally{f.close();}
});

test("customized demo files and non-demo records are left unchanged",()=>{
  const f=fixture();try{
    const id=demoDocuments[0].id;
    writeFileSync(path.join(f.dir,"uploads",id),"Custom content must survive.");
    f.db.prepare("UPDATE documents SET uploaded_by='real-user' WHERE id=?").run(demoDocuments[1].id);
    assert.equal(refreshDemoDocuments(f.db,f.dir),4);
    assert.equal(readFileSync(path.join(f.dir,"uploads",id),"utf8"),"Custom content must survive.");
    assert.equal(f.db.prepare("SELECT mime FROM documents WHERE id=?").get(demoDocuments[1].id).mime,"text/plain");
  }finally{f.close();}
});

test("conflicting generated files are not overwritten",()=>{
  const f=fixture();try{
    const key=`${demoDocuments[0].id}-v2.pdf`;
    writeFileSync(path.join(f.dir,"uploads",key),"Retain this file");
    assert.throws(()=>refreshDemoDocuments(f.db,f.dir),/Refusing to overwrite/);
    assert.equal(readFileSync(path.join(f.dir,"uploads",key),"utf8"),"Retain this file");
  }finally{f.close();}
});

test("symlinked upload directories are rejected",()=>{
  const f=fixture();const other=mkdtempSync(path.join(tmpdir(),"acquire-other-"));
  try{rmSync(path.join(f.dir,"uploads"),{recursive:true});symlinkSync(other,path.join(f.dir,"uploads"));assert.throws(()=>refreshDemoDocuments(f.db,f.dir),/symlink/);}
  finally{f.close();rmSync(other,{recursive:true,force:true});}
});
