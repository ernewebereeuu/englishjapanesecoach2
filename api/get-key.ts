// This is a serverless function that can be deployed to Vercel.
// It securely retrieves the API key from server-side environment variables
// and sends it to the client-side application.

export default (req, res) => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on the server.' });
  }
  
  return res.status(200).json({ apiKey });
};
