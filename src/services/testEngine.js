/**
 * Share Port API Client - Automated Test Assertions & Variable Chaining Engine
 * 100% feature match with Python RequestEngine._run_test_assertions
 */

// Navigates dot-separated paths and array indices like 'data.items.0.id'
export function extractJsonPath(data, path) {
  if (!path || !path.trim()) {
    return { exists: true, value: data };
  }
  const parts = path.trim().split('.');
  let curr = data;

  for (const part of parts) {
    const trimmed = part.trim();
    if (curr === null || curr === undefined) {
      return { exists: false, value: null };
    }

    if (Array.isArray(curr)) {
      const idx = parseInt(trimmed, 10);
      if (!isNaN(idx) && idx >= 0 && idx < curr.length) {
        curr = curr[idx];
      } else {
        return { exists: false, value: null };
      }
    } else if (typeof curr === 'object') {
      if (Object.prototype.hasOwnProperty.call(curr, trimmed)) {
        curr = curr[trimmed];
      } else {
        return { exists: false, value: null };
      }
    } else {
      return { exists: false, value: null };
    }
  }

  return { exists: true, value: curr };
}

// Replaces all {{variable}} occurrences with values from the variables dictionary
export function interpolateVariables(text, variables = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, varName) => {
    if (Object.prototype.hasOwnProperty.call(variables, varName)) {
      return variables[varName] !== undefined && variables[varName] !== null
        ? String(variables[varName])
        : match;
    }
    return match;
  });
}

// Recursively interpolate objects/arrays/strings
export function interpolateDeep(target, variables = {}) {
  if (!target || typeof target !== 'object') {
    return typeof target === 'string' ? interpolateVariables(target, variables) : target;
  }
  if (Array.isArray(target)) {
    return target.map(item => interpolateDeep(item, variables));
  }
  const copy = {};
  for (const [k, v] of Object.entries(target)) {
    copy[k] = interpolateDeep(v, variables);
  }
  return copy;
}

/**
 * Evaluates the 11 built-in automated test assertions against response metrics
 * Returns { results: Array, extractedVars: Object }
 */
export function runTestAssertions(tests = [], response = {}, initialVars = {}) {
  const results = [];
  const extractedVars = { ...initialVars };

  const statusCode = response.status || 0;
  const latencyMs = response.timeMs || 0;
  const bodyText = response.body || '';
  const headers = response.headers || {};

  // Case-insensitive headers map
  const headersLower = {};
  Object.entries(headers).forEach(([k, v]) => {
    headersLower[k.toLowerCase()] = String(v);
  });

  // Lazy JSON parse cache
  let parsedJson = null;
  let jsonParsedAttempted = false;
  function getJson() {
    if (!jsonParsedAttempted) {
      jsonParsedAttempted = true;
      try {
        parsedJson = JSON.parse(bodyText);
      } catch (e) {
        parsedJson = null;
      }
    }
    return parsedJson;
  }

  for (const t of tests) {
    if (!t || t.enabled === false) continue;
    const tType = (t.type || '').trim();
    const tName = (t.name || '').trim();
    const tTarget = (t.target || '').trim();
    const tValue = (t.value !== undefined ? String(t.value) : '').trim();

    // 1. Status Code Assertions
    if (tType === 'status_code' || tType === 'status_200') {
      const expectedRaw = (tValue || '200').toLowerCase();
      let passed = false;
      let detail = `Actual: ${statusCode}`;

      if (expectedRaw === '2xx') {
        passed = statusCode >= 200 && statusCode < 300;
        detail = passed ? `Status ${statusCode} in 2xx range` : `Status ${statusCode} not in 2xx range`;
      } else if (expectedRaw === '3xx') {
        passed = statusCode >= 300 && statusCode < 400;
        detail = passed ? `Status ${statusCode} in 3xx range` : `Status ${statusCode} not in 3xx range`;
      } else if (expectedRaw === '4xx') {
        passed = statusCode >= 400 && statusCode < 500;
        detail = passed ? `Status ${statusCode} in 4xx range` : `Status ${statusCode} not in 4xx range`;
      } else if (expectedRaw === '5xx') {
        passed = statusCode >= 500 && statusCode < 600;
        detail = passed ? `Status ${statusCode} in 5xx range` : `Status ${statusCode} not in 5xx range`;
      } else if (expectedRaw.includes(',')) {
        const allowedList = expectedRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        passed = allowedList.includes(statusCode);
        detail = `Actual: ${statusCode} (Expected one of: ${expectedRaw})`;
      } else {
        const targetCode = parseInt(expectedRaw, 10);
        passed = !isNaN(targetCode) && statusCode === targetCode;
        detail = `Actual: ${statusCode}`;
      }

      results.push({
        name: tName || `Status code is ${expectedRaw.toUpperCase()}`,
        passed,
        detail
      });
    }

    // 2. Response Time / Latency Assertions
    else if (tType === 'response_time' || tType === 'time_500') {
      const maxMs = parseFloat(tValue || '500') || 500;
      const passed = latencyMs < maxMs;
      results.push({
        name: tName || `Response time < ${maxMs} ms`,
        passed,
        detail: `Actual: ${Math.round(latencyMs)} ms (Threshold: < ${maxMs} ms)`
      });
    }

    // 3. Response Header Exists
    else if (tType === 'header_exists') {
      const headerName = (tTarget || tValue).trim();
      const passed = Object.prototype.hasOwnProperty.call(headersLower, headerName.toLowerCase());
      results.push({
        name: tName || `Header '${headerName}' exists`,
        passed,
        detail: passed ? `Value: ${headersLower[headerName.toLowerCase()]}` : 'Header not found'
      });
    }

    // 4. Response Header Contains Value
    else if (tType === 'header_contains') {
      const headerName = tTarget.trim();
      const expectedVal = tValue.toLowerCase();
      const actualVal = headersLower[headerName.toLowerCase()] || '';
      const passed = actualVal.toLowerCase().includes(expectedVal);
      results.push({
        name: tName || `Header '${headerName}' contains '${expectedVal}'`,
        passed,
        detail: actualVal ? `Actual: '${actualVal}'` : 'Header missing'
      });
    }

    // 5. Response Body Contains String
    else if (tType === 'body_contains') {
      const keyword = tValue;
      const passed = bodyText.includes(keyword);
      results.push({
        name: tName || `Body contains '${keyword}'`,
        passed,
        detail: passed ? 'Found matching string in response body' : 'String not found in response body'
      });
    }

    // 6. Response Body Does NOT Contain String
    else if (tType === 'body_not_contains') {
      const keyword = tValue;
      const passed = !bodyText.includes(keyword);
      results.push({
        name: tName || `Body does not contain '${keyword}'`,
        passed,
        detail: passed ? 'Correctly absent from response body' : `Found unexpected '${keyword}' in body`
      });
    }

    // 7. Body is Valid JSON
    else if (tType === 'body_is_json' || tType === 'valid_json') {
      const pj = getJson();
      const passed = pj !== null;
      results.push({
        name: tName || 'Body is valid JSON',
        passed,
        detail: passed ? 'Parsed successfully into JSON object' : 'Failed to parse JSON body'
      });
    }

    // 8. JSON Key Exists (supports dot path e.g. data.items.0.id)
    else if (tType === 'json_key' || tType === 'json_key_exists' || tType === 'json_check') {
      const path = (tTarget || tValue).trim();
      const pj = getJson();
      if (pj === null) {
        results.push({
          name: tName || `JSON has path '${path}'`,
          passed: false,
          detail: 'Response is not valid JSON'
        });
      } else {
        const { exists, value } = extractJsonPath(pj, path);
        results.push({
          name: tName || `JSON has path '${path}'`,
          passed: exists,
          detail: exists ? `Value: ${JSON.stringify(value).substring(0, 40)}` : `Path '${path}' not found`
        });
      }
    }

    // 9. JSON Value Equals Expected
    else if (tType === 'json_value' || tType === 'json_value_equals') {
      const path = tTarget.trim();
      const expected = tValue.trim();
      const pj = getJson();
      if (pj === null) {
        results.push({
          name: tName || `JSON '${path}' == '${expected}'`,
          passed: false,
          detail: 'Response is not valid JSON'
        });
      } else {
        const { exists, value } = extractJsonPath(pj, path);
        if (!exists) {
          results.push({
            name: tName || `JSON '${path}' == '${expected}'`,
            passed: false,
            detail: `Path '${path}' not found in JSON`
          });
        } else {
          const actualStr = String(value).trim().toLowerCase();
          const passed = actualStr === expected.toLowerCase();
          results.push({
            name: tName || `JSON '${path}' == '${expected}'`,
            passed,
            detail: `Actual: ${JSON.stringify(value)}`
          });
        }
      }
    }

    // 10. JSON Array is Not Empty
    else if (tType === 'json_array_not_empty') {
      const path = (tTarget || tValue).trim();
      const pj = getJson();
      if (pj === null) {
        results.push({
          name: tName || `Array '${path || 'root'}' is not empty`,
          passed: false,
          detail: 'Response is not valid JSON'
        });
      } else {
        const { exists, value } = extractJsonPath(pj, path);
        if (exists && Array.isArray(value)) {
          const passed = value.length > 0;
          results.push({
            name: tName || `Array '${path || 'root'}' is not empty`,
            passed,
            detail: `Array contains ${value.length} items`
          });
        } else {
          results.push({
            name: tName || `Array '${path || 'root'}' is not empty`,
            passed: false,
            detail: 'Target is not an array or does not exist'
          });
        }
      }
    }

    // 11. Extract Variable into Environment (Chaining)
    else if (tType === 'extract_var' || tType === 'extract_variable') {
      const path = tTarget.trim();
      const varName = (tValue || path).trim();
      const pj = getJson();
      if (pj !== null) {
        const { exists, value } = extractJsonPath(pj, path);
        if (exists && value !== null && value !== undefined) {
          const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
          extractedVars[varName] = strVal;
          results.push({
            name: tName || `Extract {{${varName}}} from '${path}'`,
            passed: true,
            detail: `Saved {{${varName}}} = "${strVal.substring(0, 30)}${strVal.length > 30 ? '...' : ''}"`
          });
        } else {
          results.push({
            name: tName || `Extract {{${varName}}} from '${path}'`,
            passed: false,
            detail: `Could not extract: path '${path}' not found`
          });
        }
      } else {
        results.push({
          name: tName || `Extract {{${varName}}} from '${path}'`,
          passed: false,
          detail: 'Response body is not valid JSON'
        });
      }
    }
  }

  return { results, extractedVars };
}

// Generate executable cURL Command
export function generateCurlCommand({
  method = 'GET',
  url = '',
  baseUrl = 'http://localhost:3000',
  headers = [],
  params = [],
  bodyType = 'none',
  bodyContent = '',
  formDataFields = [],
  urlencodedFields = [],
  auth = {}
}) {
  let resolvedUrl = url || '';
  const cleanBase = (baseUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');
  if (resolvedUrl.includes('{{baseUrl}}')) {
    resolvedUrl = resolvedUrl.replace(/\{\{baseUrl\}\}/g, cleanBase);
  } else if (resolvedUrl.startsWith('/')) {
    resolvedUrl = `${cleanBase}${resolvedUrl}`;
  } else if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
    resolvedUrl = resolvedUrl ? `${cleanBase}/${resolvedUrl}` : cleanBase;
  }

  // Append query params
  try {
    const urlObj = new URL(resolvedUrl);
    (params || []).forEach(p => {
      if (p.enabled && p.key) urlObj.searchParams.append(p.key, p.value || '');
    });
    resolvedUrl = urlObj.toString();
  } catch (e) {}

  const parts = [`curl -X ${method.toUpperCase()} "${resolvedUrl}"`];

  // Auth headers
  const aType = (auth.type || '').toLowerCase();
  if ((aType === 'bearer' || aType === 'bearer token') && auth.token) {
    parts.push(`-H "Authorization: ${auth.prefix || 'Bearer'} ${auth.token}"`);
  } else if (aType === 'basic' || aType === 'basic auth') {
    parts.push(`-u "${auth.username || ''}:${auth.password || ''}"`);
  } else if ((aType === 'apikey' || aType === 'api key') && auth.key && auth.value && auth.addTo !== 'query') {
    parts.push(`-H "${auth.key}: ${auth.value}"`);
  }

  // Headers
  (headers || []).forEach(h => {
    if (h.enabled && h.key) {
      parts.push(`-H "${h.key}: ${h.value || ''}"`);
    }
  });

  // Body
  const m = method.toUpperCase();
  if (!['GET', 'HEAD'].includes(m)) {
    if (bodyType === 'json' || bodyType === 'raw') {
      parts.push(`-H "Content-Type: application/json"`);
      if (bodyContent) {
        const escaped = bodyContent.replace(/"/g, '\\"');
        parts.push(`-d "${escaped}"`);
      }
    } else if (bodyType === 'x-www-form-urlencoded') {
      parts.push(`-H "Content-Type: application/x-www-form-urlencoded"`);
      const search = new URLSearchParams();
      (urlencodedFields || []).forEach(f => {
        if (f.enabled && f.key) search.append(f.key, f.value || '');
      });
      parts.push(`-d "${search.toString()}"`);
    } else if (bodyType === 'form-data') {
      (formDataFields || []).forEach(f => {
        if (f.enabled && f.key) {
          parts.push(`-F "${f.key}=${f.value || ''}"`);
        }
      });
    }
  }

  return parts.join(' \\\n  ');
}

// Generate Markdown Batch Runner Test Report
export function generateMarkdownReport(collectionName, runSummary) {
  const { totalRequests, passedRequests, failedRequests, totalTests, passedTests, failedTests, durationMs, itemReports } = runSummary;

  let md = `# 📊 Test Run Report: ${collectionName}\n\n`;
  md += `**Date**: ${new Date().toLocaleString()}  \n`;
  md += `**Total Requests**: ${totalRequests} (${passedRequests} Passed, ${failedRequests} Failed)  \n`;
  md += `**Total Assertions**: ${totalTests} (${passedTests} Passed, ${failedTests} Failed)  \n`;
  md += `**Total Duration**: ${durationMs} ms  \n\n`;

  md += `## Request Details\n\n`;
  md += `| Method | Request Name | Status | Latency | Assertions |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  itemReports.forEach(item => {
    const statusIcon = item.failedCount === 0 ? '✅ PASS' : '❌ FAIL';
    md += `| \`${item.method}\` | ${item.name} | ${item.status} | ${item.timeMs}ms | ${statusIcon} (${item.passedCount}/${item.totalCount}) |\n`;
  });

  md += `\n### Detailed Assertions Log\n\n`;
  itemReports.forEach(item => {
    md += `#### ${item.method} ${item.name} (${item.status} - ${item.timeMs}ms)\n`;
    if (item.testResults && item.testResults.length > 0) {
      item.testResults.forEach(t => {
        const mark = t.passed ? '✓' : '✗';
        md += `- [${mark}] **${t.name}**: ${t.detail || ''}\n`;
      });
    } else {
      md += `*No assertions configured*\n`;
    }
    md += `\n`;
  });

  return md;
}
