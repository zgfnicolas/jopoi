import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

/** Ephemeral self-signed localhost fixture. No certificate store or network changes. */
export function localhostCertificate() {
  const length=(n:number):Buffer=>n<128?Buffer.from([n]):(()=>{const bytes: number[]=[];while(n){bytes.unshift(n&255);n>>>=8;}return Buffer.from([128|bytes.length,...bytes]);})();
  const der=(tag:number,...parts:Buffer[])=>{const data=Buffer.concat(parts);return Buffer.concat([Buffer.from([tag]),length(data.length),data]);};
  const sequence=(...parts:Buffer[])=>der(0x30,...parts);
  const integer=(bytes:Buffer)=>der(2,bytes);
  const oid=(bytes:number[])=>der(6,Buffer.from(bytes));
  const algorithm=sequence(oid([0x2a,0x86,0x48,0x86,0xf7,0x0d,1,1,11]),der(5));
  const name=sequence(der(0x31,sequence(oid([0x55,4,3]),der(0x0c,Buffer.from("localhost")))));
  const date=(at:Date)=>der(0x17,Buffer.from(at.toISOString().slice(2,19).replace(/[-:T]/g,"")+"Z"));
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const san=sequence(oid([0x55,0x1d,0x11]),der(4,sequence(der(0x82,Buffer.from("localhost")),der(0x87,Buffer.from([127,0,0,1])))));
  const serial=randomBytes(16);serial[0]|=128;
  const tbs=sequence(der(0xa0,integer(Buffer.from([2]))),integer(Buffer.concat([Buffer.from([0]),serial])),algorithm,name,
    sequence(date(new Date(Date.now()-86400000)),date(new Date(Date.now()+86400000))),name,
    publicKey.export({type:"spki",format:"der"}),der(0xa3,sequence(san)));
  const cert=sequence(tbs,algorithm,der(3,Buffer.concat([Buffer.from([0]),sign("sha256",tbs,privateKey)])));
  return {key:privateKey.export({type:"pkcs8",format:"pem"}),cert:`-----BEGIN CERTIFICATE-----\n${cert.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`};
}
