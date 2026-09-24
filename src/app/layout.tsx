import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:{default:"Succera — The next chapter starts here",template:"%s · Succera"},description:"A private workspace for Canadian business acquisitions. Connect buyers, owners, and advisors, and move every deal forward.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
