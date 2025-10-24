// This API route securely provides the API key from server-side
// environment variables to the client-side application.
export default (req, res) => {
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    res.status(200).json({ apiKey });
  } else {
    res.status(500).json({ error: 'API_KEY environment variable not set on the server.' });
  }
};
