function getRootData(result) {
    const data = result?.data;
    return {
        info: data?.info ?? null,
        parts: data?.parts ?? [],
    };
}
function getInfo(result) {
    return result?.data?.info ?? null;
}
function getParts(result) {
    return result?.data?.parts ?? [];
}
function extractTextFromParts(parts) {
    const textParts = parts.filter((p) => p.type === "text");
    if (textParts.length === 0)
        return null;
    return textParts.map((p) => p.text).join("\n");
}
function extractStructuredOutputFromInfo(info) {
    return info?.structured ?? null;
}
function extractErrorFromInfo(info) {
    if (!info?.error)
        return null;
    return {
        name: info.error.name,
        message: info.error.data?.message,
        retries: info.error.data?.retries,
    };
}
export function normalizeSdkResponse(result) {
    const raw = result;
    const { info, parts } = getRootData(result);
    const text = extractTextFromParts(parts);
    const otherParts = parts.filter((p) => p.type !== "text");
    const structuredOutput = extractStructuredOutputFromInfo(info);
    const error = extractErrorFromInfo(info);
    return { raw, info, parts, text, otherParts, structuredOutput, error };
}
export function extractText(normalized) {
    return normalized.text;
}
export function extractStructuredOutput(normalized) {
    return normalized.structuredOutput;
}
export function isStructuredOutputError(error) {
    return error?.name === "StructuredOutputError";
}
export function formatTextOutput(normalized) {
    if (normalized.text) {
        return normalized.text;
    }
    if (normalized.structuredOutput !== null) {
        return JSON.stringify(normalized.structuredOutput, null, 2);
    }
    return "[No text content returned from model]";
}
export function formatJsonOutput(normalized) {
    const output = {};
    if (normalized.structuredOutput !== null) {
        output.structured = normalized.structuredOutput;
    }
    if (normalized.text) {
        output.text = normalized.text;
    }
    if (normalized.error) {
        output.error = normalized.error;
    }
    return JSON.stringify(output, null, 2);
}
