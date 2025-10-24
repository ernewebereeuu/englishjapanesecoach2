export const getFriendlyErrorMessage = (error: unknown): string => {
    const defaultMessage = "Ocurrió un error. Por favor, inténtalo de nuevo.";

    let errorMessage = '';
    // The error from `live.connect`'s `onerror` is an ErrorEvent, so we check its message property.
    if (error instanceof Event && 'message' in error) {
        errorMessage = (error as ErrorEvent).message;
    } else if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        return defaultMessage;
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        return "Has alcanzado tu cuota de API. Por favor, revisa tu plan y detalles de facturación en Google AI Studio e inténtalo de nuevo más tarde.";
    }

    // Try to parse JSON for a more specific message from generateContent
    try {
        const parsedError = JSON.parse(errorMessage);
        if (parsedError.error && parsedError.error.message) {
            // The message can be long, with details. Let's just take the first line.
            return `Error de la API: ${parsedError.error.message.split('\\n')[0]}`;
        }
    } catch (parseError) {
        // Not a JSON string, just return the message
        return errorMessage;
    }

    return errorMessage || defaultMessage;
}
