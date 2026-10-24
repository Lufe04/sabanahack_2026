import { PHOTO } from '../../../../../cultivos/service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){const {id}=await params;return PHOTO(request,id);}
