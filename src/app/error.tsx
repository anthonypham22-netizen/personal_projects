"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="release-page"><h1>We couldn’t open this page.</h1><p>Please try again. Your saved work is still in the workspace.</p><button className="button button-dark" onClick={reset}>Try again</button></main>;}
