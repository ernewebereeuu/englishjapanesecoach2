
// This is a Vercel Edge Function which is faster and uses modern JS APIs.
// It will be available at the `/api/get-key` endpoint.

export const config = {
    runtime: 'edge',
};

// The handler function receives a standard Request object and must return a Response object.
export default function handler(request: Request) {
    // process.env.API_KEY is securely accessed from Vercel's environment variables.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        // If the key is not found, return a 500 server error.
        return new Response(
            JSON.stringify({ error: 'API key is not configured on the server. Please set it in your Vercel project settings.' }),
            { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            }
        );
    }

    // If the key is found, return it in a JSON object.
    return new Response(
        JSON.stringify({ apiKey }),
        { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        }
    );
}
