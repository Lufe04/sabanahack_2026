import { handlers } from './http.mjs';
import { makeRepository } from './repository.mjs';
let repository;
export async function getRepository(){
 if(!repository){
  if(!process.env.DATABASE_URL)throw new Error('Falta DATABASE_URL');
  const {Pool}=await import('pg');
  // Mantener TLS y sslmode de DATABASE_URL; no desactivar verificación de certificados.
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:7000,idleTimeoutMillis:10000});
  repository=makeRepository(pool);
 }return repository;
}
export const {POST,GET,PHOTO,MAP}=handlers(getRepository);
