import {getChatGPTUser} from '@/app/chatgpt-auth';
// This server-only comparison uses the verified Site owner's email.
// Visitor identity comes from the trusted Sites dispatcher, never request JSON.
const OWNER_EMAIL='lfsv23@gmail.com';
export async function access(){
 const user=await getChatGPTUser();
 return {signedIn:!!user,canEdit:!!user&&user.email.trim().toLowerCase()===OWNER_EMAIL};
}
