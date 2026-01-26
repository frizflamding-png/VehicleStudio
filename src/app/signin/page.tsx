 import { redirect } from 'next/navigation';
 
 export default function SignInPage({
   searchParams,
 }: {
   searchParams?: { next?: string };
 }) {
   const next = searchParams?.next;
   const target = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
   redirect(target);
 }
