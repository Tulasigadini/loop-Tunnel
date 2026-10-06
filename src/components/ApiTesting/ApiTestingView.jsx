import React, { useState, useEffect, useRef } from 'react';
import {
  Folder, Plus, Search, MoreVertical, Save, Copy, Play, Send,
  FileText, Check, ChevronDown, ChevronRight, Lock, Trash2, ArrowUpRight,
  Code2, Sparkles, CheckCircle2, XCircle, Terminal, Download, Upload,
  Layers, RefreshCw, Key, Shield, HelpCircle, FileUp, Globe, Edit2,
  Share2, Link2, ExternalLink, X, RotateCcw, AlertTriangle, CheckSquare,
  GripVertical, Settings, Sliders
} from 'lucide-react';
import { ApiTestingService, StorageAPI, SystemAPI } from '../../services/api';
import {
  runTestAssertions,
  interpolateVariables,
  generateCurlCommand,
  generateMarkdownReport,
  extractJsonPath
} from '../../services/testEngine';

export default function ApiTestingView({ initialRequest, onClearInitialRequest }) {
  // Collections State
  const [collections, setCollections] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null);
  const [selectedColId, setSelectedColId] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [expandedCols, setExpandedCols] = useState({});

  // Layout State (Resizable Sidebar & Response Height)
  const [sidebarWidth, setSidebarWidth] = useState(310);
  const [responseHeight, setResponseHeight] = useState(340);
  const isDraggingSidebar = useRef(false);
  const isDraggingResponse = useRef(false);

  // Drag and drop state for requests across collections
  const [draggedReq, setDraggedReq] = useState(null); // { colId, reqId }
  const [dragOverColId, setDragOverColId] = useState(null);
  const [dragOverReqId, setDragOverReqId] = useState(null);

  // Request State
  const [reqTitle, setReqTitle] = useState('GET Local Server Root');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('{{baseUrl}}/');
  const [activeTab, setActiveTab] = useState('params'); // params, headers, body, auth, tests

  // Params (2-way sync with URL, empty items unchecked by default)
  const [params, setParams] = useState([
    { key: '', value: '', description: '', enabled: false }
  ]);

  // Headers (empty items unchecked by default)
  const [headers, setHeaders] = useState([
    { key: 'Accept', value: 'application/json, text/html, */*', description: '', enabled: true },
    { key: '', value: '', description: '', enabled: false }
  ]);
  const [showJsonHeadersModal, setShowJsonHeadersModal] = useState(false);
  const [jsonHeadersText, setJsonHeadersText] = useState('');

  // Body
  const [bodyType, setBodyType] = useState('none'); // none, form-data, x-www-form-urlencoded, raw, binary, GraphQL
  const [rawFormat, setRawFormat] = useState('JSON');
  const [formDataFields, setFormDataFields] = useState([
    { key: '', type: 'Text', value: '', description: '', enabled: false }
  ]);
  const [urlencodedFields, setUrlencodedFields] = useState([
    { key: '', value: '', description: '', enabled: false }
  ]);
  const [rawBody, setRawBody] = useState('{\n  "message": "Hello from Share Port API Testing"\n}');
  const [binaryPath, setBinaryPath] = useState('');
  const [graphqlQuery, setGraphqlQuery] = useState('query {\n  hello\n}');
  const [graphqlVariables, setGraphqlVariables] = useState('{}');

  // Auth
  const [authType, setAuthType] = useState('No Auth');
  const [authToken, setAuthToken] = useState('');
  const [authPrefix, setAuthPrefix] = useState('Bearer');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [apiKeyName, setApiKeyName] = useState('X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyAddTo, setApiKeyAddTo] = useState('header');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsService, setAwsService] = useState('execute-api');

  // 11 Automated Test Assertions
  const [tests, setTests] = useState([
    { id: 't1', name: 'Status code is 200', type: 'status_code', value: '200', target: '', enabled: true },
    { id: 't2', name: 'Response time is less than 500ms', type: 'response_time', value: '500', target: '', enabled: true }
  ]);

  // Response State
  const [response, setResponse] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [extractedVars, setExtractedVars] = useState({});
  const [loading, setLoading] = useState(false);
  const [responseTab, setResponseTab] = useState('pretty'); // pretty, raw, headers, cookies, tests
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Response Search State (Ctrl+F)
  const [showResponseSearch, setShowResponseSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState(0);

  // Kebab menu & Renaming
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Modals
  const [showColModal, setShowColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColBaseUrl, setNewColBaseUrl] = useState('http://localhost:3000');

  const [showReqModal, setShowReqModal] = useState(false);
  const [newReqName, setNewReqName] = useState('');
  const [newReqMethod, setNewReqMethod] = useState('GET');
  const [newReqColId, setNewReqColId] = useState('');

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete Confirmation State ("Yes" / "No")
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'col' | 'req', id, name }

  // Export / Share Link Modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportShareLink, setExportShareLink] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Import Link Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState('link'); // 'link', 'paste'
  const [importInputLink, setImportInputLink] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  // Base URL & Variables Settings Modal
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [customVariables, setCustomVariables] = useState([
    { key: 'baseUrl', value: 'http://localhost:3000', description: 'Default API host' }
  ]);

  // In-Page Collection Runner State
  const [showRunnerModal, setShowRunnerModal] = useState(false);
  const [runnerCol, setRunnerCol] = useState(null);
  const [runnerRunning, setRunnerRunning] = useState(false);
  const [runnerProgress, setRunnerProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [runnerSummary, setRunnerSummary] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // 1. Initial Load & Starter Setup
  useEffect(() => {
    async function load() {
      const data = await StorageAPI.getCollections();
      if (data && Array.isArray(data) && data.length > 0) {
        setCollections(data);
        setSelectedColId(data[0].id);
        const expMap = {};
        data.forEach(c => { expMap[c.id] = true; });
        setExpandedCols(expMap);

        if (data[0].variables?.baseUrl) {
          setBaseUrl(data[0].variables.baseUrl);
        }
        if (data[0].variables) {
          const varList = Object.entries(data[0].variables).map(([k, v]) => ({ key: k, value: String(v), description: '' }));
          if (varList.length > 0) setCustomVariables(varList);
        }
        if (data[0].items && data[0].items.length > 0) {
          loadRequest(data[0].items[0]);
        }
      } else {
        const starter = [
          {
            id: 'col_starter',
            name: 'Local Server Starter',
            variables: { baseUrl: 'http://localhost:3000' },
            items: [
              {
                id: 'r1',
                name: 'GET Health / Root',
                method: 'GET',
                url: '{{baseUrl}}/',
                params: [{ key: '', value: '', description: '', enabled: false }],
                headers: [{ key: 'Accept', value: 'application/json, text/html, */*', description: '', enabled: true }, { key: '', value: '', description: '', enabled: false }],
                bodyType: 'none',
                tests: [
                  { id: 't1', name: 'Status code is 200', type: 'status_code', value: '200', target: '', enabled: true },
                  { id: 't2', name: 'Response time < 500ms', type: 'response_time', value: '500', target: '', enabled: true }
                ]
              },
              {
                id: 'r2',
                name: 'POST Sample JSON',
                method: 'POST',
                url: '{{baseUrl}}/api/echo',
                params: [{ key: '', value: '', description: '', enabled: false }],
                headers: [{ key: 'Content-Type', value: 'application/json', description: '', enabled: true }, { key: 'Accept', value: 'application/json', description: '', enabled: true }],
                bodyType: 'raw',
                rawFormat: 'JSON',
                rawBody: '{\n  "status": "testing",\n  "ok": true\n}',
                tests: [
                  { id: 't1', name: 'Status is 2xx', type: 'status_code', value: '2xx', target: '', enabled: true },
                  { id: 't2', name: 'Body is valid JSON', type: 'body_is_json', value: '', target: '', enabled: true },
                  { id: 't3', name: 'Extract Token/Var', type: 'extract_var', value: 'savedStatus', target: 'status', enabled: true }
                ]
              }
            ]
          }
        ];
        setCollections(starter);
        setSelectedColId(starter[0].id);
        setExpandedCols({ [starter[0].id]: true });
        loadRequest(starter[0].items[0]);
        StorageAPI.saveCollections(starter);
      }
    }
    load();
  }, []);

  // 2. Handle Traffic Inspector Import
  useEffect(() => {
    if (initialRequest) {
      setReqTitle(`${initialRequest.method || 'GET'} ${initialRequest.path || '/'}`);
      setMethod(initialRequest.method || 'GET');
      setUrl(`http://localhost:${initialRequest.port || 3000}${initialRequest.path || '/'}`);
      if (initialRequest.reqHeaders) {
        const hList = Object.entries(initialRequest.reqHeaders)
          .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
          .map(([k, v]) => ({ key: k, value: String(v), description: '', enabled: true }));
        hList.push({ key: '', value: '', description: '', enabled: false });
        setHeaders(hList);
      }
      if (initialRequest.reqBody) {
        setBodyType('raw');
        setRawBody(initialRequest.reqBody);
      }
      if (onClearInitialRequest) onClearInitialRequest();
    }
  }, [initialRequest]);

  // 3. Global Keyboard Shortcuts (Ctrl+Enter = Send, Ctrl+S = Save, Ctrl+F = Search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRequest();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (response) {
          e.preventDefault();
          setShowResponseSearch(true);
        }
      } else if (e.key === 'Escape') {
        setShowResponseSearch(false);
        setActiveMenuId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [response, url, method, params, headers, rawBody, bodyType, authType, authToken]);

  // 4. Sash Drag Listeners
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingSidebar.current) {
        const newW = Math.min(Math.max(e.clientX - 20, 220), 480);
        setSidebarWidth(newW);
      } else if (isDraggingResponse.current) {
        const newH = Math.min(Math.max(window.innerHeight - e.clientY - 40, 160), 650);
        setResponseHeight(newH);
      }
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
      isDraggingResponse.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 5. Global Click-Outside Listener to Close 3-Dots Menus Immediately
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.kebab-menu-container') && !e.target.closest('.kebab-menu-btn')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Duplicate Name Formatter: handles 'copy', 'copy 2', 'imported', etc.
  const formatDuplicateName = (name, tag = 'copy') => {
    const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\s*\\(${safeTag}(?:\\s+(\\d+))?\\)$`);
    const match = (name || '').match(regex);
    if (!match) {
      return `${name || 'Item'} (${tag})`;
    }
    const nextNum = match[1] ? parseInt(match[1], 10) + 1 : 2;
    return (name || 'Item').replace(regex, ` (${tag} ${nextNum})`);
  };

  // Immediate Real-Time Auto-Sync for active request changes into collections state
  const updateCurrentRequestItem = (patch) => {
    if (!selectedReq) return;
    const currentId = selectedReq.id;
    const targetColId = selectedColId || collections[0]?.id;

    setSelectedReq(prev => prev ? ({ ...prev, ...patch }) : null);

    setCollections(prevCols => {
      const updated = prevCols.map(col => {
        if (col.id === targetColId) {
          return {
            ...col,
            items: (col.items || []).map(i => i.id === currentId ? { ...i, ...patch } : i)
          };
        }
        return col;
      });
      StorageAPI.saveCollections(updated);
      return updated;
    });
  };

  // 6. Two-Way Sync: URL String <-> Params Table
  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    try {
      const qIndex = newUrl.indexOf('?');
      if (qIndex !== -1) {
        const qs = newUrl.substring(qIndex + 1);
        const searchParams = new URLSearchParams(qs);
        const newParams = [];
        searchParams.forEach((value, key) => {
          newParams.push({ key, value, description: '', enabled: true });
        });
        newParams.push({ key: '', value: '', description: '', enabled: false });
        setParams(newParams);
      }
    } catch (e) {}
  };

  const handleParamChange = (index, field, value) => {
    const updated = [...params];
    updated[index][field] = value;
    // Auto-enable if typing in an empty row
    if ((field === 'key' || field === 'value') && value.trim().length > 0 && !updated[index].enabled) {
      updated[index].enabled = true;
    }
    // Append fresh empty row if typing on the last row
    if (index === updated.length - 1 && (updated[index].key || updated[index].value)) {
      updated.push({ key: '', value: '', description: '', enabled: false });
    }
    setParams(updated);

    try {
      const basePart = url.split('?')[0];
      const validParams = updated.filter(p => p.enabled && p.key.trim().length > 0);
      if (validParams.length > 0) {
        const search = new URLSearchParams();
        validParams.forEach(p => search.append(p.key.trim(), p.value || ''));
        setUrl(`${basePart}?${search.toString()}`);
      } else {
        setUrl(basePart);
      }
    } catch (e) {}
  };

  const handleHeaderChange = (index, field, value) => {
    const updated = [...headers];
    updated[index][field] = value;
    if ((field === 'key' || field === 'value') && value.trim().length > 0 && !updated[index].enabled) {
      updated[index].enabled = true;
    }
    if (index === updated.length - 1 && (updated[index].key || updated[index].value)) {
      updated.push({ key: '', value: '', description: '', enabled: false });
    }
    setHeaders(updated);
  };

  const handleFormDataChange = (index, field, value) => {
    const updated = [...formDataFields];
    updated[index][field] = value;
    if ((field === 'key' || field === 'value') && value.trim().length > 0 && !updated[index].enabled) {
      updated[index].enabled = true;
    }
    if (index === updated.length - 1 && (updated[index].key || updated[index].value)) {
      updated.push({ key: '', type: 'Text', value: '', description: '', enabled: false });
    }
    setFormDataFields(updated);
  };

  const handleUrlencodedChange = (index, field, value) => {
    const updated = [...urlencodedFields];
    updated[index][field] = value;
    if ((field === 'key' || field === 'value') && value.trim().length > 0 && !updated[index].enabled) {
      updated[index].enabled = true;
    }
    if (index === updated.length - 1 && (updated[index].key || updated[index].value)) {
      updated.push({ key: '', value: '', description: '', enabled: false });
    }
    setUrlencodedFields(updated);
  };

  // Base URL update with immediate auto-sync
  const handleBaseUrlChange = (val) => {
    setBaseUrl(val);
    if (collections.length > 0) {
      const updated = collections.map(col => {
        if (col.id === selectedColId || !selectedColId) {
          return { ...col, variables: { ...(col.variables || {}), baseUrl: val } };
        }
        return col;
      });
      setCollections(updated);
      StorageAPI.saveCollections(updated);
    }
  };

  // Load a request item into current editor
  const loadRequest = (item) => {
    setSelectedReq(item);
    setReqTitle(item.name || `${item.method} Request`);
    setMethod(item.method || 'GET');
    setUrl(item.url || '{{baseUrl}}/');
    setParams(item.params && item.params.length > 0 ? item.params : [{ key: '', value: '', description: '', enabled: false }]);
    setHeaders(item.headers && item.headers.length > 0 ? item.headers : [{ key: 'Accept', value: 'application/json, text/html, */*', description: '', enabled: true }, { key: '', value: '', description: '', enabled: false }]);
    setBodyType(item.bodyType || 'none');
    setRawBody(item.rawBody || '{\n  "message": "Hello"\n}');
    setRawFormat(item.rawFormat || 'JSON');
    setAuthType(item.authType || 'No Auth');
    if (item.authToken) setAuthToken(item.authToken);
    if (item.authPrefix) setAuthPrefix(item.authPrefix);
    if (item.authUsername) setAuthUsername(item.authUsername);
    if (item.authPassword) setAuthPassword(item.authPassword);
    if (item.apiKeyName) setApiKeyName(item.apiKeyName);
    if (item.apiKeyValue) setApiKeyValue(item.apiKeyValue);
    if (item.apiKeyAddTo) setApiKeyAddTo(item.apiKeyAddTo);
    if (item.tests && Array.isArray(item.tests)) {
      setTests(item.tests);
    }
    setActiveMenuId(null);
  };

  // Beautify JSON in body
  const handleBeautifyJson = () => {
    try {
      const parsed = JSON.parse(rawBody);
      setRawBody(JSON.stringify(parsed, null, 2));
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  };

  // Insert Quick Header Presets
  const applyHeaderPreset = (presetType) => {
    let newEntries = [];
    if (presetType === 'json') {
      newEntries = [
        { key: 'Content-Type', value: 'application/json', description: '', enabled: true },
        { key: 'Accept', value: 'application/json', description: '', enabled: true }
      ];
    } else if (presetType === 'bearer') {
      newEntries = [
        { key: 'Authorization', value: 'Bearer {{token}}', description: '', enabled: true }
      ];
    } else if (presetType === 'cors') {
      newEntries = [
        { key: 'Origin', value: 'http://localhost:3000', description: '', enabled: true },
        { key: 'Access-Control-Request-Method', value: method, description: '', enabled: true }
      ];
    } else if (presetType === 'browser') {
      newEntries = [
        { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', description: '', enabled: true },
        { key: 'Accept-Language', value: 'en-US,en;q=0.9', description: '', enabled: true }
      ];
    }

    const filtered = headers.filter(h => h.key || h.value);
    newEntries.forEach(ne => {
      const existsIdx = filtered.findIndex(h => h.key.toLowerCase() === ne.key.toLowerCase());
      if (existsIdx !== -1) {
        filtered[existsIdx] = ne;
      } else {
        filtered.push(ne);
      }
    });
    filtered.push({ key: '', value: '', description: '', enabled: false });
    setHeaders(filtered);
  };

  // Add Assertion Shortcut
  const addAssertion = (type) => {
    const id = 't_' + Date.now();
    let newAssert = { id, type, enabled: true, target: '', value: '' };

    if (type === 'status_code') {
      newAssert.name = 'Status code is 200';
      newAssert.value = '200';
    } else if (type === 'response_time') {
      newAssert.name = 'Response time < 500 ms';
      newAssert.value = '500';
    } else if (type === 'body_is_json') {
      newAssert.name = 'Body is valid JSON';
    } else if (type === 'header_exists') {
      newAssert.name = 'Header exists';
      newAssert.target = 'content-type';
    } else if (type === 'body_contains') {
      newAssert.name = 'Body contains text';
      newAssert.value = 'success';
    } else if (type === 'json_key') {
      newAssert.name = 'JSON key exists';
      newAssert.target = 'data.id';
    } else if (type === 'json_value') {
      newAssert.name = 'JSON value equals';
      newAssert.target = 'status';
      newAssert.value = 'ok';
    } else if (type === 'json_array_not_empty') {
      newAssert.name = 'JSON array not empty';
      newAssert.target = 'items';
    } else if (type === 'extract_var') {
      newAssert.name = 'Extract variable into {{token}}';
      newAssert.target = 'token';
      newAssert.value = 'token';
    }

    setTests([...tests, newAssert]);
  };

  // Core Request Execution
  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    setTestResults([]);

    try {
      const activeCol = collections.find(c => c.id === selectedColId);
      const activeVars = {
        baseUrl,
        ...(activeCol?.variables || {}),
        ...extractedVars
      };

      // Variable interpolation
      const interpolatedUrl = interpolateVariables(url, activeVars);
      const interpolatedHeaders = headers
        .filter(h => h.enabled && h.key)
        .map(h => ({
          ...h,
          key: interpolateVariables(h.key, activeVars),
          value: interpolateVariables(h.value, activeVars)
        }));
      const interpolatedParams = params
        .filter(p => p.enabled && p.key)
        .map(p => ({
          ...p,
          key: interpolateVariables(p.key, activeVars),
          value: interpolateVariables(p.value, activeVars)
        }));
      const interpolatedBody = interpolateVariables(rawBody, activeVars);
      const interpolatedAuthToken = interpolateVariables(authToken, activeVars);

      const payload = {
        method,
        url: interpolatedUrl,
        baseUrl,
        params: interpolatedParams,
        headers: interpolatedHeaders,
        bodyType,
        bodyContent: interpolatedBody,
        rawFormat,
        formDataFields: formDataFields.filter(f => f.enabled && f.key),
        urlencodedFields: urlencodedFields.filter(f => f.enabled && f.key),
        binaryPath,
        graphqlQuery,
        graphqlVariables,
        auth: {
          type: authType,
          token: interpolatedAuthToken,
          prefix: authPrefix,
          username: authUsername,
          password: authPassword,
          key: apiKeyName,
          value: apiKeyValue,
          addTo: apiKeyAddTo,
          accessKey: awsAccessKey,
          secretKey: awsSecretKey,
          region: awsRegion,
          service: awsService
        }
      };

      const res = await ApiTestingService.sendRequest(payload);
      setResponse(res);

      // Evaluate 11 Automated Test Assertions & Variable Chaining
      const { results: evaluated, extractedVars: newVars } = runTestAssertions(tests, res, activeVars);
      setTestResults(evaluated);
      setExtractedVars(newVars);

      // Auto-update match count if response search is open
      if (showResponseSearch && searchQuery.trim() && res.body) {
        const matches = (res.body.match(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        setSearchMatches(matches);
      }

    } catch (err) {
      setResponse({
        success: false,
        status: 0,
        statusText: 'Client Execution Error',
        error: err.message,
        timeMs: 0,
        headers: {},
        cookies: [],
        body: ''
      });
    } finally {
      setLoading(false);
    }
  };

  // Open active request URL directly in default external browser
  const handleOpenBrowser = () => {
    const cleanBase = (baseUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');
    let resolvedUrl = url.replace(/\{\{baseUrl\}\}/g, cleanBase);
    if (resolvedUrl.startsWith('/')) resolvedUrl = `${cleanBase}${resolvedUrl}`;
    else if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
      resolvedUrl = `${cleanBase}/${resolvedUrl}`;
    }
    try {
      const uObj = new URL(resolvedUrl);
      params.forEach(p => {
        if (p.enabled && p.key) uObj.searchParams.append(p.key, p.value || '');
      });
      SystemAPI.openExternal(uObj.toString());
    } catch (e) {
      SystemAPI.openExternal(resolvedUrl);
    }
  };

  // Copy cURL command to clipboard
  const handleCopyCurl = async () => {
    const cmd = generateCurlCommand({
      method,
      url,
      baseUrl,
      headers: headers.filter(h => h.enabled && h.key),
      params: params.filter(p => p.enabled && p.key),
      bodyType,
      bodyContent: rawBody,
      formDataFields: formDataFields.filter(f => f.enabled && f.key),
      urlencodedFields: urlencodedFields.filter(f => f.enabled && f.key),
      auth: { type: authType, token: authToken, prefix: authPrefix, username: authUsername, password: authPassword, key: apiKeyName, value: apiKeyValue, addTo: apiKeyAddTo }
    });
    await SystemAPI.copyText(cmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  // Save current request to collection
  const handleSaveRequest = async () => {
    const newReq = {
      id: selectedReq?.id || ('req_' + Date.now()),
      name: reqTitle,
      method,
      url,
      params,
      headers,
      bodyType,
      rawBody,
      rawFormat,
      authType,
      authToken,
      authPrefix,
      authUsername,
      authPassword,
      apiKeyName,
      apiKeyValue,
      apiKeyAddTo,
      tests
    };

    const targetColId = selectedColId || collections[0]?.id;
    const updated = collections.map(col => {
      if (col.id === targetColId) {
        const items = col.items || [];
        const existingIdx = items.findIndex(i => i.id === newReq.id);
        if (existingIdx !== -1) {
          const newItems = [...items];
          newItems[existingIdx] = newReq;
          return { ...col, items: newItems };
        } else {
          return { ...col, items: [...items, newReq] };
        }
      }
      return col;
    });

    setCollections(updated);
    setSelectedReq(newReq);
    await StorageAPI.saveCollections(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);
  };

  // DRAG AND DROP HANDLERS (Reorder within collection or Move across collections)
  const handleDragStart = (e, colId, reqId) => {
    setDraggedReq({ colId, reqId });
    e.dataTransfer.setData('text/plain', JSON.stringify({ colId, reqId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnRequest = (targetColId, targetReqId) => {
    if (!draggedReq) return;
    const { colId: srcColId, reqId: srcReqId } = draggedReq;
    if (srcColId === targetColId && srcReqId === targetReqId) {
      setDraggedReq(null);
      setDragOverColId(null);
      setDragOverReqId(null);
      return;
    }

    const updated = collections.map(col => {
      // Find source item
      if (col.id === srcColId && srcColId === targetColId) {
        // Reordering in SAME collection
        const items = [...(col.items || [])];
        const srcIdx = items.findIndex(i => i.id === srcReqId);
        const tgtIdx = items.findIndex(i => i.id === targetReqId);
        if (srcIdx !== -1 && tgtIdx !== -1) {
          const [movedItem] = items.splice(srcIdx, 1);
          items.splice(tgtIdx, 0, movedItem);
          return { ...col, items };
        }
      } else if (col.id === srcColId) {
        // Remove from source collection
        return { ...col, items: (col.items || []).filter(i => i.id !== srcReqId) };
      } else if (col.id === targetColId) {
        // Add to target collection at target position
        const srcCol = collections.find(c => c.id === srcColId);
        const itemToMove = srcCol?.items?.find(i => i.id === srcReqId);
        if (itemToMove) {
          const items = [...(col.items || [])];
          const tgtIdx = items.findIndex(i => i.id === targetReqId);
          if (tgtIdx !== -1) {
            items.splice(tgtIdx, 0, itemToMove);
          } else {
            items.push(itemToMove);
          }
          return { ...col, items };
        }
      }
      return col;
    });

    setCollections(updated);
    StorageAPI.saveCollections(updated);
    setDraggedReq(null);
    setDragOverColId(null);
    setDragOverReqId(null);
  };

  const handleDropOnCollectionHeader = (targetColId) => {
    if (!draggedReq) return;
    const { colId: srcColId, reqId: srcReqId } = draggedReq;
    if (srcColId === targetColId) {
      setDraggedReq(null);
      setDragOverColId(null);
      return;
    }

    // Move request into the target collection at the end
    const srcCol = collections.find(c => c.id === srcColId);
    const itemToMove = srcCol?.items?.find(i => i.id === srcReqId);
    if (!itemToMove) return;

    const updated = collections.map(col => {
      if (col.id === srcColId) {
        return { ...col, items: (col.items || []).filter(i => i.id !== srcReqId) };
      } else if (col.id === targetColId) {
        return { ...col, items: [...(col.items || []), itemToMove] };
      }
      return col;
    });

    setCollections(updated);
    StorageAPI.saveCollections(updated);
    setDraggedReq(null);
    setDragOverColId(null);
  };

  // DUPLICATE REQUEST (keeps original name without (copy))
  const handleDuplicateRequest = (colId, req) => {
    const copyReq = {
      ...req,
      id: 'req_' + Date.now() + Math.random().toString(36).substring(2, 6),
      name: req.name
    };

    const updated = collections.map(col => {
      if (col.id === colId) {
        const items = [...(col.items || [])];
        const curIdx = items.findIndex(i => i.id === req.id);
        if (curIdx !== -1) {
          items.splice(curIdx + 1, 0, copyReq);
        } else {
          items.push(copyReq);
        }
        return { ...col, items };
      }
      return col;
    });

    setCollections(updated);
    setSelectedColId(colId);
    loadRequest(copyReq);
    StorageAPI.saveCollections(updated);
    setActiveMenuId(null);
  };

  // DUPLICATE COLLECTION (keeps original name without (copy))
  const handleDuplicateCollection = (col) => {
    const copyCol = {
      ...col,
      id: 'col_' + Date.now() + Math.random().toString(36).substring(2, 6),
      name: col.name,
      items: (col.items || []).map(i => ({
        ...i,
        id: 'req_' + Date.now() + Math.random().toString(36).substring(2, 6),
        name: i.name
      }))
    };

    const curIdx = collections.findIndex(c => c.id === col.id);
    const updated = [...collections];
    if (curIdx !== -1) {
      updated.splice(curIdx + 1, 0, copyCol);
    } else {
      updated.push(copyCol);
    }

    setCollections(updated);
    setSelectedColId(copyCol.id);
    setExpandedCols(prev => ({ ...prev, [copyCol.id]: true }));
    if (copyCol.items.length > 0) {
      loadRequest(copyCol.items[0]);
    }
    StorageAPI.saveCollections(updated);
    setActiveMenuId(null);
  };

  // Delete Request
  const handleDeleteRequest = (reqId) => {
    const updated = collections.map(col => ({
      ...col,
      items: (col.items || []).filter(i => i.id !== reqId)
    }));
    setCollections(updated);
    StorageAPI.saveCollections(updated);
    if (selectedReq?.id === reqId) {
      const activeCol = updated.find(c => c.id === selectedColId) || updated[0];
      if (activeCol?.items?.length > 0) {
        loadRequest(activeCol.items[0]);
      } else {
        setSelectedReq(null);
        setReqTitle('New Request');
      }
    }
    setActiveMenuId(null);
  };

  // Delete Collection
  const handleDeleteCollection = (colId) => {
    if (collections.length <= 1) {
      alert('Cannot delete the last collection.');
      return;
    }
    const updated = collections.filter(c => c.id !== colId);
    setCollections(updated);
    setSelectedColId(updated[0].id);
    if (updated[0].items?.length > 0) loadRequest(updated[0].items[0]);
    StorageAPI.saveCollections(updated);
    setActiveMenuId(null);
  };

  // Rename Confirmation
  const handleConfirmRename = () => {
    if (!renameValue.trim() || !renameTarget) return;
    if (renameTarget.type === 'col') {
      const updated = collections.map(c => c.id === renameTarget.id ? { ...c, name: renameValue.trim() } : c);
      setCollections(updated);
      StorageAPI.saveCollections(updated);
    } else if (renameTarget.type === 'req') {
      const updated = collections.map(c => ({
        ...c,
        items: (c.items || []).map(i => i.id === renameTarget.id ? { ...i, name: renameValue.trim() } : i)
      }));
      setCollections(updated);
      if (selectedReq?.id === renameTarget.id) {
        setReqTitle(renameValue.trim());
        setSelectedReq(prev => prev ? ({ ...prev, name: renameValue.trim() }) : null);
      }
      StorageAPI.saveCollections(updated);
    }
    setShowRenameModal(false);
    setRenameTarget(null);
    setRenameValue('');
    setActiveMenuId(null);
  };

  // Create Collection
  const handleCreateCollection = () => {
    if (!newColName.trim()) return;
    const newCol = {
      id: 'col_' + Date.now(),
      name: newColName.trim(),
      variables: { baseUrl: newColBaseUrl.trim() || 'http://localhost:3000' },
      items: []
    };
    const updated = [...collections, newCol];
    setCollections(updated);
    setSelectedColId(newCol.id);
    setExpandedCols({ ...expandedCols, [newCol.id]: true });
    setBaseUrl(newCol.variables.baseUrl);
    StorageAPI.saveCollections(updated);
    setShowColModal(false);
    setNewColName('');
  };

  // Create Request
  const handleCreateRequest = () => {
    if (!newReqName.trim()) return;
    const targetColId = newReqColId || selectedColId || collections[0]?.id;
    const newReq = {
      id: 'req_' + Date.now(),
      name: newReqName.trim(),
      method: newReqMethod,
      url: '{{baseUrl}}/',
      params: [{ key: '', value: '', description: '', enabled: false }],
      headers: [
        { key: 'Accept', value: 'application/json, text/html, */*', description: '', enabled: true },
        { key: '', value: '', description: '', enabled: false }
      ],
      bodyType: 'none',
      rawBody: '{\n  "message": "Hello"\n}',
      tests: [
        { id: 't1', name: 'Status code is 200', type: 'status_code', value: '200', target: '', enabled: true }
      ]
    };

    const updated = collections.map(col => {
      if (col.id === targetColId) {
        return { ...col, items: [...(col.items || []), newReq] };
      }
      return col;
    });

    setCollections(updated);
    setSelectedColId(targetColId);
    setExpandedCols({ ...expandedCols, [targetColId]: true });
    loadRequest(newReq);
    StorageAPI.saveCollections(updated);
    setShowReqModal(false);
    setNewReqName('');
  };

  // EXPORT / GENERATE SHARE LINK
  const handleOpenExportModal = async (colToExport) => {
    const target = colToExport || collections.find(c => c.id === selectedColId) || collections[0];
    setShowExportModal(true);
    setExportLoading(true);
    setCopiedShareLink(false);

    try {
      // Post to CORS-enabled anonymous store bytebin.lucko.me (matches Python ShareService)
      const res = await fetch('https://bytebin.lucko.me/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.key) {
          setExportShareLink(`https://bytebin.lucko.me/${data.key}`);
          setExportLoading(false);
          return;
        }
      }
    } catch (e) {}

    // Fallback self-contained share URL
    const fallbackUrl = `https://shareport.link/c#data=${encodeURIComponent(JSON.stringify(target))}`;
    setExportShareLink(fallbackUrl);
    setExportLoading(false);
  };

  // Download Collection File
  const handleDownloadCollectionFile = (colToDownload) => {
    const target = colToDownload || collections.find(c => c.id === selectedColId) || collections[0];
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(target, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `${(target.name || 'collection').replace(/[^a-z0-9_-]/gi, '_')}.collection.json`);
    dl.click();
  };

  // IMPORT FROM LINK / OPENAPI / POSTMAN
  const handleImportFromLink = async () => {
    if (!importInputLink.trim()) return;
    setImportLoading(true);

    try {
      const link = importInputLink.trim();
      let importedData = null;

      if (link.includes('#data=')) {
        const jsonPart = decodeURIComponent(link.split('#data=')[1]);
        importedData = JSON.parse(jsonPart);
      } else {
        const res = await fetch(link);
        importedData = await res.json();
      }

      if (importedData) {
        parseAndImportData(importedData);
        setShowImportModal(false);
        setImportInputLink('');
      } else {
        alert('Could not parse response from link.');
      }
    } catch (err) {
      alert(`Import failed: ${err.message}. If CORS prevents direct browser fetching, paste the JSON into the 'Paste Raw JSON' tab.`);
    } finally {
      setImportLoading(false);
    }
  };

  // Parse & Import Data (OpenAPI 3.x, Swagger 2.0, Postman v2.1, SharePort)
  const parseAndImportData = (data) => {
    let newCols = [];

    // OpenAPI / Swagger
    if (data.openapi || data.swagger || (data.paths && typeof data.paths === 'object')) {
      const paths = data.paths || {};
      const parsedItems = [];
      let base = data.servers?.[0]?.url || 'http://localhost:8000';

      Object.entries(paths).forEach(([pathStr, pathObj]) => {
        if (!pathObj || typeof pathObj !== 'object') return;
        ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].forEach(m => {
          if (pathObj[m]) {
            const op = pathObj[m];
            const tags = op.tags || [];
            const tagPrefix = tags.length > 0 ? `[${tags[0]}] ` : '';
            const summary = op.summary || op.operationId || `${m.toUpperCase()} ${pathStr}`;

            const qParams = [];
            (op.parameters || []).forEach(p => {
              if (p.in === 'query') {
                qParams.push({ key: p.name, value: String(p.example || p.default || ''), description: p.description || '', enabled: Boolean(p.required) });
              }
            });
            qParams.push({ key: '', value: '', description: '', enabled: false });

            let sampleBody = '';
            let bType = 'none';
            if (op.requestBody?.content?.['application/json']) {
              bType = 'raw';
              const ex = op.requestBody.content['application/json'].example;
              sampleBody = ex ? JSON.stringify(ex, null, 2) : '{\n  \n}';
            }

            parsedItems.push({
              id: 'req_' + Math.random().toString(36).substring(2),
              name: `${tagPrefix}${summary}`,
              method: m.toUpperCase(),
              url: `{{baseUrl}}${pathStr}`,
              params: qParams,
              headers: [
                { key: 'Accept', value: 'application/json', description: '', enabled: true },
                { key: '', value: '', description: '', enabled: false }
              ],
              bodyType: bType,
              rawBody: sampleBody,
              tests: [
                { id: 't1', name: 'Status code is 200', type: 'status_code', value: '200', target: '', enabled: true }
              ]
            });
          }
        });
      });

      newCols.push({
        id: 'col_' + Date.now(),
        name: data.info?.title || 'OpenAPI Collection',
        variables: { baseUrl: base },
        items: parsedItems
      });
    }
    // Postman Collection v2.1
    else if (data.info && (data.item || data.items)) {
      const itemsList = data.item || data.items || [];
      const parsedItems = [];

      const flatten = (items, folderName = '') => {
        items.forEach(it => {
          if (it.item && Array.isArray(it.item)) {
            flatten(it.item, folderName ? `${folderName}/${it.name}` : it.name);
          } else if (it.request) {
            const r = it.request;
            const rName = folderName ? `[${folderName}] ${it.name}` : it.name;
            const m = r.method || 'GET';
            const rawU = typeof r.url === 'string' ? r.url : r.url?.raw || '{{baseUrl}}/';

            parsedItems.push({
              id: 'req_' + Math.random().toString(36).substring(2),
              name: rName,
              method: m,
              url: rawU,
              params: [{ key: '', value: '', description: '', enabled: false }],
              headers: [
                { key: 'Accept', value: 'application/json, text/html, */*', description: '', enabled: true },
                { key: '', value: '', description: '', enabled: false }
              ],
              bodyType: r.body?.mode === 'raw' ? 'raw' : 'none',
              rawBody: r.body?.raw || '',
              tests: [
                { id: 't1', name: 'Status code is 200', type: 'status_code', value: '200', target: '', enabled: true }
              ]
            });
          }
        });
      };
      flatten(itemsList);

      newCols.push({
        id: 'col_' + Date.now(),
        name: data.info.name || 'Postman Collection',
        variables: { baseUrl: 'http://localhost:3000' },
        items: parsedItems
      });
    }
    // SharePort native format
    else if (Array.isArray(data)) {
      newCols = data;
    } else if (data.name && data.items) {
      newCols = [data];
    }

    if (newCols.length > 0) {
      const processedCols = newCols.map(nc => {
        const nameCollides = collections.some(c => c.name.toLowerCase() === (nc.name || '').toLowerCase());
        const finalName = nameCollides ? formatDuplicateName(nc.name, 'imported') : (nc.name || 'Imported Collection');
        return {
          ...nc,
          id: 'col_' + Date.now() + Math.random().toString(36).substring(2, 6),
          name: finalName,
          items: (nc.items || []).map(item => ({
            ...item,
            id: 'req_' + Date.now() + Math.random().toString(36).substring(2, 6)
          }))
        };
      });

      const merged = [...collections, ...processedCols];
      setCollections(merged);
      setSelectedColId(processedCols[0].id);
      const expMap = { ...expandedCols };
      processedCols.forEach(c => { expMap[c.id] = true; });
      setExpandedCols(expMap);

      if (processedCols[0].items && processedCols[0].items.length > 0) {
        loadRequest(processedCols[0].items[0]);
      }
      StorageAPI.saveCollections(merged);
      alert(`Success! Imported ${processedCols.length} collection(s) with ${processedCols.reduce((a, c) => a + (c.items?.length || 0), 0)} endpoints.`);
    } else {
      alert('Could not recognize collection schema. Please check the JSON format.');
    }
  };

  // In-Page Batch Collection Runner Execution
  const runBatchCollection = async (colToRun) => {
    if (!colToRun || !colToRun.items || colToRun.items.length === 0) {
      alert('This collection has no requests to run.');
      return;
    }

    setRunnerCol(colToRun);
    setShowRunnerModal(true);
    setRunnerRunning(true);
    setRunnerSummary(null);

    const items = colToRun.items;
    let chainedVars = {
      baseUrl: colToRun.variables?.baseUrl || baseUrl,
      ...(colToRun.variables || {})
    };

    const itemReports = [];
    const startTime = Date.now();
    let passedReqCount = 0;
    let failedReqCount = 0;
    let totalAsserts = 0;
    let passedAsserts = 0;
    let failedAsserts = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setRunnerProgress({ current: i + 1, total: items.length, currentName: item.name });

      // Variable interpolation with chained variables
      const resUrl = interpolateVariables(item.url || '{{baseUrl}}/', chainedVars);
      const resHeaders = (item.headers || [])
        .filter(h => h.enabled && h.key)
        .map(h => ({
          ...h,
          key: interpolateVariables(h.key, chainedVars),
          value: interpolateVariables(h.value, chainedVars)
        }));
      const resParams = (item.params || [])
        .filter(p => p.enabled && p.key)
        .map(p => ({
          ...p,
          key: interpolateVariables(p.key, chainedVars),
          value: interpolateVariables(p.value, chainedVars)
        }));
      const resBody = interpolateVariables(item.rawBody || '', chainedVars);
      const resToken = interpolateVariables(item.authToken || '', chainedVars);

      const reqPayload = {
        method: item.method || 'GET',
        url: resUrl,
        baseUrl: chainedVars.baseUrl,
        params: resParams,
        headers: resHeaders,
        bodyType: item.bodyType || 'none',
        bodyContent: resBody,
        rawFormat: item.rawFormat || 'JSON',
        formDataFields: (item.formDataFields || []).filter(f => f.enabled && f.key),
        urlencodedFields: (item.urlencodedFields || []).filter(f => f.enabled && f.key),
        auth: {
          type: item.authType || 'none',
          token: resToken,
          prefix: item.authPrefix || 'Bearer',
          username: item.authUsername,
          password: item.authPassword,
          key: item.apiKeyName,
          value: item.apiKeyValue,
          addTo: item.apiKeyAddTo
        }
      };

      const res = await ApiTestingService.sendRequest(reqPayload);
      const { results: evaluated, extractedVars: newChained } = runTestAssertions(item.tests || [], res, chainedVars);

      // Chaining: merge extracted variables for subsequent requests
      chainedVars = { ...chainedVars, ...newChained };

      const passedCount = evaluated.filter(e => e.passed).length;
      const failedCount = evaluated.length - passedCount;
      totalAsserts += evaluated.length;
      passedAsserts += passedCount;
      failedAsserts += failedCount;

      if (failedCount === 0 && res.success && res.status < 400) {
        passedReqCount++;
      } else {
        failedReqCount++;
      }

      itemReports.push({
        id: item.id,
        name: item.name,
        method: item.method,
        status: res.status,
        statusText: res.statusText,
        timeMs: res.timeMs,
        passedCount,
        totalCount: evaluated.length,
        failedCount,
        testResults: evaluated
      });
    }

    const durationMs = Date.now() - startTime;
    const summary = {
      totalRequests: items.length,
      passedRequests: passedReqCount,
      failedRequests: failedReqCount,
      totalTests: totalAsserts,
      passedTests: passedAsserts,
      failedTests: failedAsserts,
      durationMs,
      itemReports
    };

    setRunnerSummary(summary);
    setRunnerRunning(false);
  };

  // Copy Markdown Report
  const handleCopyMarkdownReport = async () => {
    if (!runnerSummary || !runnerCol) return;
    const md = generateMarkdownReport(runnerCol.name, runnerSummary);
    await SystemAPI.copyText(md);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  // Method Badge Helper
  const getMethodBadge = (m) => {
    switch (m?.toUpperCase()) {
      case 'GET': return { bg: '#F0FDFA', text: '#0D9488', border: '#99F6E4' };
      case 'POST': return { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' };
      case 'PUT': return { bg: '#EEF2FF', text: '#6366F1', border: '#C7D2FE' };
      case 'DELETE': return { bg: '#FFF1F2', text: '#E11D48', border: '#FECDD3' };
      case 'PATCH': return { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' };
      default: return { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' };
    }
  };

  const activeCol = collections.find(c => c.id === selectedColId) || collections[0];

  return (
    <div style={{
      width: '100%',
      minHeight: 'calc(100vh - 65px)',
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 18px',
      gap: '12px',
      boxSizing: 'border-box'
    }}>
      {/* MAIN CONTENT SPLIT: SIDEBAR + WORKSPACE */}
      <div style={{ display: 'flex', gap: '0px', flex: 1, minHeight: '500px', position: 'relative' }}>
        {/* 1. LEFT SIDEBAR (Resizable) */}
        <div style={{
          width: `${sidebarWidth}px`,
          minWidth: '220px',
          maxWidth: '480px',
          background: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: 'var(--shadow-sm)',
          flexShrink: 0
        }}>
          {/* Header & Quick Action Buttons (+ Col, + Req, Import) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)' }}>Collections</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={() => setShowColModal(true)}
                title="Add New Collection"
                style={{
                  padding: '4px 7px',
                  background: '#F0FDFA',
                  color: '#0D9488',
                  border: '1px solid #99F6E4',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                + Col
              </button>
              <button
                onClick={() => {
                  setNewReqColId(selectedColId || collections[0]?.id || '');
                  setShowReqModal(true);
                }}
                title="Add Request"
                style={{
                  padding: '4px 7px',
                  background: '#F0FDFA',
                  color: '#0D9488',
                  border: '1px solid #99F6E4',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                + Req
              </button>
              <button
                onClick={() => {
                  setImportTab('link');
                  setShowImportModal(true);
                }}
                title="Import collection from Share Link or JSON"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '4px 7px',
                  background: '#F0FDFA',
                  color: '#0D9488',
                  border: '1px solid #99F6E4',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                <Download size={11} />
                <span>Import</span>
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Filter requests..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                fontSize: '12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: '#FFFFFF'
              }}
            />
          </div>

          {/* Collections List (Supports HTML5 Drag & Drop for reordering and moving across collections) */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {collections.map(col => {
              const isColSelected = selectedColId === col.id;
              const isExpanded = expandedCols[col.id] !== false;
              const isDragOverCol = dragOverColId === col.id;
              const colItems = (col.items || []).filter(i =>
                !searchFilter ||
                i.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                (i.url && i.url.toLowerCase().includes(searchFilter.toLowerCase()))
              );

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverColId !== col.id) setDragOverColId(col.id);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    if (dragOverColId === col.id) setDragOverColId(null);
                  }}
                  onDrop={() => handleDropOnCollectionHeader(col.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    borderRadius: '8px',
                    border: isDragOverCol ? '2px dashed #0D9488' : '1px solid transparent',
                    background: isDragOverCol ? '#F0FDFA' : 'transparent',
                    transition: 'border 0.15s ease'
                  }}
                >
                  {/* Collection Header Row */}
                  <div
                    onClick={() => {
                      setSelectedColId(col.id);
                      if (col.variables?.baseUrl) setBaseUrl(col.variables.baseUrl);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: isColSelected ? '#F0FDFA' : '#F8FAFC',
                      border: `1px solid ${isColSelected ? '#99F6E4' : 'var(--border)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCols({ ...expandedCols, [col.id]: !isExpanded });
                        }}
                        style={{ background: 'transparent', padding: '0', color: 'var(--text-muted)' }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Folder size={14} style={{ color: '#0D9488', flexShrink: 0 }} />
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: isColSelected ? '#0F766E' : 'var(--text-main)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {col.name} ({col.items?.length || 0})
                      </span>

                      {/* Duplicate Collection Indicator */}
                      {(() => {
                        const colDups = collections.filter(c => (c.name || '').trim().toLowerCase() === (col.name || '').trim().toLowerCase());
                        if (colDups.length > 1 && colDups.findIndex(c => c.id === col.id) > 0) {
                          return (
                            <span style={{
                              fontSize: '9.5px',
                              fontWeight: '800',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: '#FEF3C7',
                              color: '#B45309',
                              border: '1px solid #FCD34D',
                              flexShrink: 0
                            }}>
                              Duplicate
                            </span>
                          );
                        }
                        return null;
                      })()}

                      {/* Duplicate Requests in Collection Indicator */}
                      {(() => {
                        const nameCounts = {};
                        (col.items || []).forEach(it => {
                          const nm = (it.name || '').trim().toLowerCase();
                          nameCounts[nm] = (nameCounts[nm] || 0) + 1;
                        });
                        const excessDups = Object.values(nameCounts).reduce((acc, count) => acc + (count > 1 ? count - 1 : 0), 0);
                        if (excessDups > 0) {
                          return (
                            <span
                              title={`Duplication detected: ${excessDups} duplicate request(s) exist in this collection`}
                              style={{
                                fontSize: '9.5px',
                                fontWeight: '800',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: '#FEF3C7',
                                color: '#B45309',
                                border: '1px solid #FCD34D',
                                flexShrink: 0
                              }}
                            >
                              {excessDups} dup
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Collection Kebab Menu */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className="kebab-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === col.id ? null : col.id);
                        }}
                        style={{ background: 'transparent', padding: '2px', color: 'var(--text-dim)', cursor: 'pointer' }}
                        title="Collection options"
                      >
                        <MoreVertical size={13} />
                      </button>

                      {activeMenuId === col.id && (
                        <div
                          className="kebab-menu-container"
                          style={{
                            position: 'absolute',
                            right: '0px',
                            top: '24px',
                            background: '#FFFFFF',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            boxShadow: 'var(--shadow-md)',
                            zIndex: 60,
                            padding: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            minWidth: '180px'
                          }}
                        >
                          {/* Run Collection */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              runBatchCollection(col);
                            }}
                            style={{
                              padding: '7px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              fontSize: '12px',
                              fontWeight: '700',
                              color: '#EA580C',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Play size={12} fill="#EA580C" />
                            <span>Run Collection</span>
                          </button>

                          {/* Export Link */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              handleOpenExportModal(col);
                            }}
                            style={{
                              padding: '7px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#0D9488',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Share2 size={12} />
                            <span>Export Link</span>
                          </button>

                          <div style={{ height: '1px', background: 'var(--border)', margin: '3px 0' }} />

                          {/* Rename */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setRenameTarget({ type: 'col', id: col.id, name: col.name });
                              setRenameValue(col.name);
                              setShowRenameModal(true);
                            }}
                            style={{
                              padding: '7px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: 'var(--text-main)',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit2 size={12} />
                            <span>Rename</span>
                          </button>

                          {/* Duplicate */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateCollection(col);
                            }}
                            style={{
                              padding: '7px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: 'var(--text-main)',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Copy size={12} />
                            <span>Duplicate</span>
                          </button>

                          <div style={{ height: '1px', background: 'var(--border)', margin: '3px 0' }} />

                          {/* Delete (Ask Yes or No) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setDeleteConfirm({ type: 'col', id: col.id, name: col.name });
                            }}
                            style={{
                              padding: '7px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#E11D48',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Requests Inside Collection (Drag & Drop Reordering - NO ARROWS) */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                      {colItems.map((item) => {
                        const badge = getMethodBadge(item.method);
                        const isSelected = selectedReq && selectedReq.id === item.id;
                        const isDragOver = dragOverReqId === item.id;

                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, col.id, item.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (dragOverReqId !== item.id) setDragOverReqId(item.id);
                            }}
                            onDragLeave={() => {
                              if (dragOverReqId === item.id) setDragOverReqId(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDropOnRequest(col.id, item.id);
                            }}
                            onClick={() => {
                              setSelectedColId(col.id);
                              loadRequest(item);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'grab',
                              background: isSelected ? '#F0FDFA' : 'transparent',
                              border: isDragOver ? '2px solid #0D9488' : isSelected ? '1px solid #99F6E4' : '1px solid transparent',
                              fontSize: '12px',
                              opacity: draggedReq?.reqId === item.id ? 0.4 : 1,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <GripVertical size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                              <span className="font-mono" style={{
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '800',
                                background: badge.bg,
                                color: badge.text,
                                border: `1px solid ${badge.border}`,
                                flexShrink: 0
                              }}>
                                {item.method}
                              </span>
                              <span style={{
                                color: isSelected ? '#0D9488' : 'var(--text-main)',
                                fontWeight: isSelected ? '700' : '500',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {item.name}
                              </span>

                              {/* DUPLICATE REQUEST BADGE */}
                              {(() => {
                                const dupMatches = colItems.filter(i => (i.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
                                if (dupMatches.length > 1) {
                                  const dupIdx = dupMatches.findIndex(i => i.id === item.id);
                                  if (dupIdx > 0) {
                                    return (
                                      <span
                                        title={`Duplication detected: ${dupMatches.length} requests named "${item.name}" exist in this collection`}
                                        style={{
                                          fontSize: '9.5px',
                                          fontWeight: '800',
                                          padding: '1px 5px',
                                          borderRadius: '4px',
                                          background: '#FEF3C7',
                                          color: '#B45309',
                                          border: '1px solid #FCD34D',
                                          flexShrink: 0,
                                          lineHeight: '1.2'
                                        }}
                                      >
                                        Duplicate{dupMatches.length > 2 ? ` #${dupIdx + 1}` : ''}
                                      </span>
                                    );
                                  }
                                }
                                return null;
                              })()}
                            </div>

                            {/* Item Menu Only (No arrows!) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
                              <button
                                className="kebab-menu-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(activeMenuId === item.id ? null : item.id);
                                }}
                                style={{ background: 'transparent', padding: '2px', color: 'var(--text-dim)', cursor: 'pointer' }}
                                title="Request options"
                              >
                                <MoreVertical size={13} />
                              </button>

                              {activeMenuId === item.id && (
                                <div
                                  className="kebab-menu-container"
                                  style={{
                                    position: 'absolute',
                                    right: '0px',
                                    top: '22px',
                                    background: '#FFFFFF',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    boxShadow: 'var(--shadow-md)',
                                    zIndex: 60,
                                    padding: '4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minWidth: '140px'
                                  }}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setRenameTarget({ type: 'req', id: item.id, name: item.name });
                                      setRenameValue(item.name);
                                      setShowRenameModal(true);
                                    }}
                                    style={{
                                      padding: '7px 10px',
                                      textAlign: 'left',
                                      background: 'transparent',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      color: 'var(--text-main)',
                                      borderRadius: '6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Edit2 size={12} />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDuplicateRequest(col.id, item);
                                    }}
                                    style={{
                                      padding: '7px 10px',
                                      textAlign: 'left',
                                      background: 'transparent',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      color: 'var(--text-main)',
                                      borderRadius: '6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Copy size={12} />
                                    <span>Duplicate</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setDeleteConfirm({ type: 'req', id: item.id, name: item.name });
                                    }}
                                    style={{
                                      padding: '7px 10px',
                                      textAlign: 'left',
                                      background: 'transparent',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      color: '#E11D48',
                                      borderRadius: '6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Trash2 size={12} />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DRAGGABLE HORIZONTAL SASH (Sidebar Width) */}
        <div
          onMouseDown={() => {
            isDraggingSidebar.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          style={{
            width: '12px',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 10
          }}
        >
          <div style={{ width: '3px', height: '36px', background: '#CBD5E1', borderRadius: '4px' }} />
        </div>

        {/* 2. MAIN REQUEST WORKSPACE + RESPONSE INSPECTOR */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          minWidth: 0
        }}>
          {/* TOP PANE: Request Builder */}
          <div style={{
            flex: 1,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto'
          }}>
            {/* Title & Top Right Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={reqTitle}
                  onChange={e => {
                    setReqTitle(e.target.value);
                    updateCurrentRequestItem({ name: e.target.value });
                  }}
                  placeholder="Request Name"
                  style={{
                    fontSize: '15px',
                    fontWeight: '800',
                    color: 'var(--text-main)',
                    border: '1px solid transparent',
                    background: 'transparent',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    minWidth: '160px',
                    maxWidth: '240px'
                  }}
                />

                {/* Duplication Detected Warning Badge */}
                {(() => {
                  const activeCol = collections.find(c => c.id === selectedColId);
                  const curReqs = (activeCol?.items || []).filter(i => (i.name || '').trim().toLowerCase() === (reqTitle || '').trim().toLowerCase());
                  if (curReqs.length > 1) {
                    const curIdx = curReqs.findIndex(i => i.id === selectedReq?.id);
                    return (
                      <span
                        title={`Duplication detected: ${curReqs.length} requests in "${activeCol?.name || 'this collection'}" share this exact name.`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#FEF3C7',
                          color: '#B45309',
                          border: '1px solid #FCD34D',
                          fontSize: '11px',
                          fontWeight: '800'
                        }}
                      >
                        <AlertTriangle size={12} />
                        <span>{curIdx > 0 ? `Duplicate Request (${curIdx + 1} of ${curReqs.length})` : `Duplicate Group (${curReqs.length})`}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* RED MARKED AREA: BASE URL & PARAMETERS / VARIABLES SETTING */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#F0FDFA',
                border: '1px solid #99F6E4',
                borderRadius: '8px',
                padding: '4px 10px',
                minWidth: '220px',
                maxWidth: '420px',
                flex: 1
              }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#0F766E', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Base:
                </span>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => handleBaseUrlChange(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="font-mono"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    padding: '2px 0',
                    minWidth: '100px'
                  }}
                />
                <button
                  onClick={() => setShowVariablesModal(true)}
                  title="Manage Base URL & Environment Parameters"
                  style={{
                    background: 'transparent',
                    padding: '2px 6px',
                    color: '#0D9488',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                >
                  <Sliders size={13} />
                  <span style={{ fontSize: '11px', fontWeight: '700' }}>Variables</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleSaveRequest}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: saveSuccess ? '#0D9488' : 'var(--text-main)'
                  }}
                >
                  <Save size={13} style={{ color: '#0D9488' }} />
                  <span>{saveSuccess ? 'Saved!' : 'Save'}</span>
                </button>

                <button
                  onClick={handleCopyCurl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: copiedCurl ? '#0D9488' : 'var(--text-main)'
                  }}
                >
                  <Terminal size={13} style={{ color: '#0D9488' }} />
                  <span>{copiedCurl ? 'Copied' : 'cURL'}</span>
                </button>

                <button
                  onClick={handleOpenBrowser}
                  title="Open request URL in default browser"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: 'var(--text-main)'
                  }}
                >
                  <Globe size={13} style={{ color: '#0D9488' }} />
                  <span>Browser</span>
                </button>
              </div>
            </div>

            {/* URL Input Bar */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={method}
                onChange={e => {
                  setMethod(e.target.value);
                  updateCurrentRequestItem({ method: e.target.value });
                }}
                style={{
                  width: '105px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '800',
                  border: 'none',
                  background: method === 'GET' ? '#0D9488' : method === 'POST' ? '#EA580C' : method === 'DELETE' ? '#E11D48' : '#6366F1',
                  color: '#FFFFFF',
                  cursor: 'pointer'
                }}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>

              <input
                type="text"
                value={url}
                onChange={e => {
                  handleUrlChange(e.target.value);
                  updateCurrentRequestItem({ url: e.target.value });
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!loading) {
                      handleSend();
                    }
                  }
                }}
                placeholder="{{baseUrl}}/"
                className="font-mono"
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-strong)',
                  background: '#FFFFFF',
                  color: 'var(--text-main)'
                }}
              />

              {/* SOLID Send Button (NO GRADIENT) */}
              <button
                onClick={handleSend}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 24px',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '800',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <Play size={13} fill="#FFFFFF" />
                <span>{loading ? 'Sending...' : 'Send'}</span>
              </button>
            </div>

            {/* Sub-Tabs: Params | Headers | Body | Auth | Tests */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              {[
                { id: 'params', label: `Params (${params.filter(p => p.enabled && p.key).length})` },
                { id: 'headers', label: `Headers (${headers.filter(h => h.enabled && h.key).length})` },
                { id: 'body', label: `Body (${bodyType})` },
                { id: 'auth', label: `Auth (${authType})` },
                { id: 'tests', label: `Tests (${tests.filter(t => t.enabled).length})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: activeTab === tab.id ? '#0D9488' : 'transparent',
                    color: activeTab === tab.id ? '#FFFFFF' : 'var(--text-muted)',
                    border: 'none',
                    transition: '0.15s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SUB-TAB CONTENTS */}
            <div style={{ flex: 1 }}>
              {/* 1. PARAMS TAB */}
              {activeTab === 'params' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Query Parameters: auto-synchronizes with URL bar. Empty items are kept unchecked.
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>KEY</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>VALUE</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>DESCRIPTION</th>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {params.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              <input
                                type="checkbox"
                                checked={p.enabled}
                                onChange={e => {
                                  const updated = [...params];
                                  updated[idx].enabled = e.target.checked;
                                  setParams(updated);
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Key"
                                value={p.key}
                                onChange={e => handleParamChange(idx, 'key', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Value"
                                value={p.value}
                                onChange={e => handleParamChange(idx, 'value', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Description"
                                value={p.description}
                                onChange={e => handleParamChange(idx, 'description', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              {params.length > 1 && (
                                <button
                                  onClick={() => {
                                    const updated = params.filter((_, i) => i !== idx);
                                    setParams(updated);
                                  }}
                                  style={{ color: '#CBD5E1', background: 'transparent' }}
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => setParams([...params, { key: '', value: '', description: '', enabled: false }])}
                    style={{ alignSelf: 'flex-start', background: 'transparent', color: '#0D9488', fontWeight: '700', fontSize: '12px' }}
                  >
                    + Add Param
                  </button>
                </div>
              )}

              {/* 2. HEADERS TAB */}
              {activeTab === 'headers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Presets:</span>
                      <button onClick={() => applyHeaderPreset('json')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + JSON
                      </button>
                      <button onClick={() => applyHeaderPreset('bearer')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + Bearer
                      </button>
                      <button onClick={() => applyHeaderPreset('cors')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + CORS
                      </button>
                      <button onClick={() => applyHeaderPreset('browser')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + User-Agent
                      </button>
                    </div>

                    <button
                      onClick={() => setShowJsonHeadersModal(!showJsonHeadersModal)}
                      style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}
                    >
                      📜 Bulk JSON
                    </button>
                  </div>

                  {showJsonHeadersModal && (
                    <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <textarea
                        rows={3}
                        value={jsonHeadersText}
                        onChange={e => setJsonHeadersText(e.target.value)}
                        placeholder={'{\n  "Authorization": "Bearer token123",\n  "Content-Type": "application/json"\n}'}
                        className="font-mono"
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowJsonHeadersModal(false)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '11px' }}>
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(jsonHeadersText);
                              const newH = Object.entries(parsed).map(([k, v]) => ({ key: k, value: String(v), description: '', enabled: true }));
                              newH.push({ key: '', value: '', description: '', enabled: false });
                              setHeaders(newH);
                              setShowJsonHeadersModal(false);
                            } catch (e) {
                              alert('Invalid JSON: ' + e.message);
                            }
                          }}
                          style={{ padding: '3px 8px', background: '#0D9488', color: '#FFFFFF', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>KEY</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>VALUE</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>DESCRIPTION</th>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {headers.map((h, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              <input
                                type="checkbox"
                                checked={h.enabled}
                                onChange={e => {
                                  const updated = [...headers];
                                  updated[idx].enabled = e.target.checked;
                                  setHeaders(updated);
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Key"
                                value={h.key}
                                onChange={e => handleHeaderChange(idx, 'key', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Value"
                                value={h.value}
                                onChange={e => handleHeaderChange(idx, 'value', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder="Description"
                                value={h.description}
                                onChange={e => handleHeaderChange(idx, 'description', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              {headers.length > 1 && (
                                <button
                                  onClick={() => {
                                    const updated = headers.filter((_, i) => i !== idx);
                                    setHeaders(updated);
                                  }}
                                  style={{ color: '#CBD5E1', background: 'transparent' }}
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => setHeaders([...headers, { key: '', value: '', description: '', enabled: false }])}
                    style={{ alignSelf: 'flex-start', background: 'transparent', color: '#0D9488', fontWeight: '700', fontSize: '12px' }}
                  >
                    + Add Header
                  </button>
                </div>
              )}

              {/* 3. BODY TAB */}
              {activeTab === 'body' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
                    {['none', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary', 'GraphQL'].map(bt => (
                      <label key={bt} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: bodyType === bt ? '#0D9488' : 'var(--text-muted)', fontWeight: bodyType === bt ? '700' : '500' }}>
                        <input
                          type="radio"
                          name="bodyType"
                          checked={bodyType === bt}
                          onChange={() => setBodyType(bt)}
                        />
                        <span>{bt}</span>
                      </label>
                    ))}

                    {bodyType === 'raw' && (
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          value={rawFormat}
                          onChange={e => setRawFormat(e.target.value)}
                          style={{ padding: '3px 8px', fontSize: '11px', fontWeight: '700', border: '1px solid var(--border)' }}
                        >
                          <option value="JSON">JSON</option>
                          <option value="Text">Text</option>
                          <option value="JavaScript">JavaScript</option>
                          <option value="HTML">HTML</option>
                          <option value="XML">XML</option>
                        </select>

                        {rawFormat === 'JSON' && (
                          <button
                            onClick={handleBeautifyJson}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: '#F0FDFA',
                              border: '1px solid #99F6E4',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#0D9488'
                            }}
                          >
                            <Sparkles size={11} />
                            <span>Beautify</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {bodyType === 'raw' && (
                    <textarea
                      rows={8}
                      value={rawBody}
                      onChange={e => setRawBody(e.target.value)}
                      className="font-mono"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        lineHeight: '1.5',
                        background: '#F8FAFC',
                        color: 'var(--text-main)'
                      }}
                    />
                  )}

                  {bodyType === 'form-data' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              <th style={{ width: '36px', padding: '6px' }}></th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>KEY</th>
                              <th style={{ width: '80px', padding: '6px', fontWeight: '700' }}>TYPE</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>VALUE / @FILEPATH</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>DESCRIPTION</th>
                              <th style={{ width: '36px', padding: '6px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {formDataFields.map((f, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ textAlign: 'center', padding: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={f.enabled}
                                    onChange={e => {
                                      const updated = [...formDataFields];
                                      updated[idx].enabled = e.target.checked;
                                      setFormDataFields(updated);
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Key"
                                    value={f.key}
                                    onChange={e => handleFormDataChange(idx, 'key', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <select
                                    value={f.type}
                                    onChange={e => handleFormDataChange(idx, 'type', e.target.value)}
                                    style={{ width: '100%', padding: '4px', border: '1px solid var(--border)' }}
                                  >
                                    <option value="Text">Text</option>
                                    <option value="File">File</option>
                                  </select>
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder={f.type === 'File' ? '@/path/to/file.ext' : 'Value'}
                                    value={f.value}
                                    onChange={e => handleFormDataChange(idx, 'value', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Description"
                                    value={f.description}
                                    onChange={e => handleFormDataChange(idx, 'description', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'center', padding: '4px' }}>
                                  {formDataFields.length > 1 && (
                                    <button
                                      onClick={() => {
                                        const updated = formDataFields.filter((_, i) => i !== idx);
                                        setFormDataFields(updated);
                                      }}
                                      style={{ color: '#CBD5E1', background: 'transparent' }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={() => setFormDataFields([...formDataFields, { key: '', type: 'Text', value: '', description: '', enabled: false }])}
                        style={{ alignSelf: 'flex-start', background: 'transparent', color: '#0D9488', fontWeight: '700', fontSize: '12px' }}
                      >
                        + Add Form Field
                      </button>
                    </div>
                  )}

                  {bodyType === 'x-www-form-urlencoded' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              <th style={{ width: '36px', padding: '6px' }}></th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>KEY</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>VALUE</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>DESCRIPTION</th>
                              <th style={{ width: '36px', padding: '6px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {urlencodedFields.map((f, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ textAlign: 'center', padding: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={f.enabled}
                                    onChange={e => {
                                      const updated = [...urlencodedFields];
                                      updated[idx].enabled = e.target.checked;
                                      setUrlencodedFields(updated);
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Key"
                                    value={f.key}
                                    onChange={e => handleUrlencodedChange(idx, 'key', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={f.value}
                                    onChange={e => handleUrlencodedChange(idx, 'value', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <input
                                    type="text"
                                    placeholder="Description"
                                    value={f.description}
                                    onChange={e => handleUrlencodedChange(idx, 'description', e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'center', padding: '4px' }}>
                                  {urlencodedFields.length > 1 && (
                                    <button
                                      onClick={() => {
                                        const updated = urlencodedFields.filter((_, i) => i !== idx);
                                        setUrlencodedFields(updated);
                                      }}
                                      style={{ color: '#CBD5E1', background: 'transparent' }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={() => setUrlencodedFields([...urlencodedFields, { key: '', value: '', description: '', enabled: false }])}
                        style={{ alignSelf: 'flex-start', background: 'transparent', color: '#0D9488', fontWeight: '700', fontSize: '12px' }}
                      >
                        + Add Field
                      </button>
                    </div>
                  )}

                  {bodyType === 'binary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>File Path (sent as application/octet-stream)</label>
                      <input
                        type="text"
                        placeholder="C:\path\to\document.pdf"
                        value={binaryPath}
                        onChange={e => setBinaryPath(e.target.value)}
                        style={{ padding: '8px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px' }}
                      />
                    </div>
                  )}

                  {bodyType === 'GraphQL' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>GraphQL Query</label>
                        <textarea
                          rows={6}
                          value={graphqlQuery}
                          onChange={e => setGraphqlQuery(e.target.value)}
                          className="font-mono"
                          style={{ width: '100%', padding: '8px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>Query Variables (JSON)</label>
                        <textarea
                          rows={6}
                          value={graphqlVariables}
                          onChange={e => setGraphqlVariables(e.target.value)}
                          className="font-mono"
                          style={{ width: '100%', padding: '8px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: '#F8FAFC' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. AUTH TAB */}
              {activeTab === 'auth' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>Authentication Method</label>
                    <select
                      value={authType}
                      onChange={e => setAuthType(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '12px', fontWeight: '700' }}
                    >
                      <option value="No Auth">No Auth</option>
                      <option value="Bearer Token">Bearer Token</option>
                      <option value="API Key">API Key</option>
                      <option value="Basic Auth">Basic Auth</option>
                      <option value="OAuth 2.0">OAuth 2.0</option>
                      <option value="Digest Auth">Digest Auth</option>
                      <option value="AWS Signature">AWS Signature</option>
                    </select>
                  </div>

                  {authType === 'Bearer Token' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Token (supports {`{{token}}`})</label>
                        <input
                          type="text"
                          placeholder="eyJhbGciOiJIUzI1NiIs..."
                          value={authToken}
                          onChange={e => setAuthToken(e.target.value)}
                          className="font-mono"
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Prefix</label>
                        <input
                          type="text"
                          placeholder="Bearer"
                          value={authPrefix}
                          onChange={e => setAuthPrefix(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  )}

                  {authType === 'API Key' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Key</label>
                          <input
                            type="text"
                            placeholder="X-API-Key"
                            value={apiKeyName}
                            onChange={e => setApiKeyName(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Value</label>
                          <input
                            type="text"
                            placeholder="secret_key"
                            value={apiKeyValue}
                            onChange={e => setApiKeyValue(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Add To</label>
                        <select
                          value={apiKeyAddTo}
                          onChange={e => setApiKeyAddTo(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)' }}
                        >
                          <option value="header">Header</option>
                          <option value="query">Query Params</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {authType === 'Basic Auth' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Username</label>
                        <input
                          type="text"
                          value={authUsername}
                          onChange={e => setAuthUsername(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Password</label>
                        <input
                          type="password"
                          value={authPassword}
                          onChange={e => setAuthPassword(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  )}

                  {authType === 'AWS Signature' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Access Key</label>
                          <input
                            type="text"
                            value={awsAccessKey}
                            onChange={e => setAwsAccessKey(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-main)' }}>Secret Key</label>
                          <input
                            type="password"
                            value={awsSecretKey}
                            onChange={e => setAwsSecretKey(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. TESTS TAB (11 Assertions & Variable Chaining) */}
              {activeTab === 'tests' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      11 Built-in Test Assertions & Variable Chaining:
                    </span>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      <button onClick={() => addAssertion('status_code')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + Status 200
                      </button>
                      <button onClick={() => addAssertion('response_time')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + Time &lt; 500ms
                      </button>
                      <button onClick={() => addAssertion('body_is_json')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + Valid JSON
                      </button>
                      <button onClick={() => addAssertion('json_key')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', fontWeight: '700' }}>
                        + JSON Path
                      </button>
                      <button onClick={() => addAssertion('extract_var')} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA', fontWeight: '700' }}>
                        + Extract Var
                      </button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>ASSERTION TYPE</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>TARGET (KEY / PATH)</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>EXPECTED / VAR NAME</th>
                          <th style={{ width: '36px', padding: '6px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tests.map((t, idx) => (
                          <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              <input
                                type="checkbox"
                                checked={t.enabled}
                                onChange={e => {
                                  const updated = [...tests];
                                  updated[idx].enabled = e.target.checked;
                                  setTests(updated);
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px', width: '220px' }}>
                              <select
                                value={t.type}
                                onChange={e => {
                                  const updated = [...tests];
                                  updated[idx].type = e.target.value;
                                  setTests(updated);
                                }}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', fontSize: '11px', fontWeight: '700' }}
                              >
                                <option value="status_code">1. Status Code (200, 2xx, 200, 201)</option>
                                <option value="response_time">2. Response Time &lt; (ms)</option>
                                <option value="header_exists">3. Header Exists</option>
                                <option value="header_contains">4. Header Contains</option>
                                <option value="body_contains">5. Body Contains</option>
                                <option value="body_not_contains">6. Body Does Not Contain</option>
                                <option value="body_is_json">7. Valid JSON</option>
                                <option value="json_key">8. JSON Key Exists (dot path)</option>
                                <option value="json_value">9. JSON Value Equals</option>
                                <option value="json_array_not_empty">10. JSON Array Not Empty</option>
                                <option value="extract_var">11. Extract Variable (Chaining)</option>
                              </select>
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder={['header_exists', 'header_contains', 'json_key', 'json_value', 'json_array_not_empty', 'extract_var'].includes(t.type) ? 'e.g. data.token' : 'N/A'}
                                value={t.target || ''}
                                onChange={e => {
                                  const updated = [...tests];
                                  updated[idx].target = e.target.value;
                                  setTests(updated);
                                }}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '4px' }}>
                              <input
                                type="text"
                                placeholder={t.type === 'extract_var' ? 'Var name (e.g. authToken)' : 'Expected value (e.g. 200)'}
                                value={t.value !== undefined ? t.value : ''}
                                onChange={e => {
                                  const updated = [...tests];
                                  updated[idx].value = e.target.value;
                                  setTests(updated);
                                }}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '4px' }}>
                              <button
                                onClick={() => {
                                  setTests(tests.filter((_, i) => i !== idx));
                                }}
                                style={{ color: '#CBD5E1', background: 'transparent' }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DRAGGABLE VERTICAL SASH (Request vs Response Height) */}
          <div
            onMouseDown={() => {
              isDraggingResponse.current = true;
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
            style={{
              height: '10px',
              cursor: 'row-resize',
              background: '#F8FAFC',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10
            }}
          >
            <div style={{ width: '40px', height: '3px', background: '#CBD5E1', borderRadius: '4px' }} />
          </div>

          {/* BOTTOM PANE: Response Viewer & Inspector */}
          <div style={{
            height: `${responseHeight}px`,
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Response Top Bar: Status Badges & Sub-tabs */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              background: '#FFFFFF'
            }}>
              {/* Status Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {response ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: response.status >= 200 && response.status < 300 ? '#F0FDFA' : response.status >= 300 && response.status < 400 ? '#EEF2FF' : '#FFF1F2',
                    color: response.status >= 200 && response.status < 300 ? '#0D9488' : response.status >= 300 && response.status < 400 ? '#6366F1' : '#E11D48',
                    border: `1px solid ${response.status >= 200 && response.status < 300 ? '#99F6E4' : response.status >= 300 && response.status < 400 ? '#C7D2FE' : '#FECDD3'}`,
                    padding: '2px 8px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: '800'
                  }}>
                    <span>●</span>
                    <span>{response.status} {response.statusText}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>• READY</span>
                )}

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ⚡ {response ? `${response.timeMs} ms` : '-- ms'}
                </span>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  📦 {response ? (response.sizeBytes > 1024 ? `${(response.sizeBytes / 1024).toFixed(1)} KB` : `${response.sizeBytes} B`) : '-- B'}
                </span>
              </div>

              {/* Sub-tabs: Pretty | Raw | Headers | Cookies | Tests */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {['pretty', 'raw', 'headers', 'cookies', 'tests'].map(rt => (
                  <button
                    key={rt}
                    onClick={() => setResponseTab(rt)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      background: responseTab === rt ? '#0D9488' : 'transparent',
                      color: responseTab === rt ? '#FFFFFF' : 'var(--text-muted)',
                      textTransform: 'capitalize'
                    }}
                  >
                    {rt === 'tests' ? `Tests (${testResults.filter(r => r.passed).length}/${testResults.length})` : rt === 'cookies' ? `Cookies (${response?.cookies?.length || 0})` : rt}
                  </button>
                ))}

                {/* Quick Copy Response */}
                {response && (
                  <button
                    onClick={async () => {
                      await SystemAPI.copyText(response.body);
                      setCopiedResponse(true);
                      setTimeout(() => setCopiedResponse(false), 2000);
                    }}
                    title="Copy Response Body"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#FFFFFF',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--text-main)'
                    }}
                  >
                    <Copy size={11} />
                    <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                  </button>
                )}

                {/* Search Toggle (Ctrl+F) */}
                {response && (
                  <button
                    onClick={() => setShowResponseSearch(!showResponseSearch)}
                    title="Search in response (Ctrl+F)"
                    style={{
                      padding: '4px 8px',
                      background: showResponseSearch ? '#F0FDFA' : '#FFFFFF',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: showResponseSearch ? '#0D9488' : 'var(--text-muted)'
                    }}
                  >
                    <Search size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* In-Response Text Search Toolbar (Ctrl+F) */}
            {showResponseSearch && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                background: '#F8FAFC',
                borderBottom: '1px solid var(--border)'
              }}>
                <Search size={13} style={{ color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  placeholder="Find in response..."
                  value={searchQuery}
                  onChange={e => {
                    const q = e.target.value;
                    setSearchQuery(q);
                    if (q.trim() && response?.body) {
                      const matches = (response.body.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
                      setSearchMatches(matches);
                    } else {
                      setSearchMatches(0);
                    }
                  }}
                  autoFocus
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    width: '200px'
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {searchQuery ? `${searchMatches} match(es)` : ''}
                </span>
                <button
                  onClick={() => setShowResponseSearch(false)}
                  style={{ marginLeft: 'auto', background: 'transparent', padding: '2px', color: 'var(--text-dim)' }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Response Viewer Panel */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {!response ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Hit <strong>Send</strong> or press <strong>Ctrl+Enter</strong> to execute request and view response.
                </div>
              ) : (
                <>
                  {/* Pretty Body */}
                  {responseTab === 'pretty' && (
                    <pre className="font-mono" style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: 'var(--text-main)', margin: 0 }}>
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(response.body), null, 2);
                        } catch (e) {
                          return response.body || response.error || 'Empty body';
                        }
                      })()}
                    </pre>
                  )}

                  {/* Raw Body */}
                  {responseTab === 'raw' && (
                    <pre className="font-mono" style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: 'var(--text-main)', margin: 0 }}>
                      {response.body || response.error || 'Empty body'}
                    </pre>
                  )}

                  {/* Headers */}
                  {responseTab === 'headers' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                      {Object.entries(response.headers || {}).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: '10px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                          <strong style={{ color: '#0D9488', minWidth: '180px' }}>{k}:</strong>
                          <span className="font-mono" style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cookies */}
                  {responseTab === 'cookies' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {response.cookies && response.cookies.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>NAME</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>VALUE</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>PATH</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>DOMAIN</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>HTTPONLY</th>
                              <th style={{ textAlign: 'left', padding: '6px', fontWeight: '700' }}>SECURE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {response.cookies.map((c, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px', fontWeight: '700', color: '#0D9488' }}>{c.name}</td>
                                <td style={{ padding: '6px', fontFamily: 'monospace' }}>{c.value}</td>
                                <td style={{ padding: '6px' }}>{c.path || '/'}</td>
                                <td style={{ padding: '6px' }}>{c.domain || '--'}</td>
                                <td style={{ padding: '6px' }}>{c.httpOnly ? '✓' : '--'}</td>
                                <td style={{ padding: '6px' }}>{c.secure ? '✓' : '--'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No cookies received from server.</span>
                      )}
                    </div>
                  )}

                  {/* Test Results Audit Log */}
                  {responseTab === 'tests' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {testResults.length === 0 ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          No test assertions were configured for this request. Go to the <strong>Tests</strong> tab to add assertions.
                        </span>
                      ) : (
                        testResults.map((tr, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: tr.passed ? '#F0FDFA' : '#FFF1F2',
                              border: `1px solid ${tr.passed ? '#99F6E4' : '#FECDD3'}`
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                              <span style={{ fontWeight: '800', color: tr.passed ? '#0D9488' : '#E11D48' }}>
                                {tr.passed ? '✓ PASS' : '✗ FAIL'}
                              </span>
                              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{tr.name}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tr.detail}</span>
                          </div>
                        ))
                      )}

                      {/* Display Extracted Variables */}
                      {Object.keys(extractedVars).length > 0 && (
                        <div style={{ marginTop: '10px', padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#EA580C', display: 'block', marginBottom: '6px' }}>
                            🔗 Active Extracted Variables (Chained):
                          </span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.entries(extractedVars).map(([k, v]) => (
                              <div key={k} style={{ background: '#FFFFFF', border: '1px solid #FED7AA', padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                <strong style={{ color: '#EA580C' }}>{`{{${k}}}`}</strong>: <span className="font-mono">{String(v).substring(0, 30)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: EXPORT & GENERATE SHARE LINK */}
      {showExportModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '480px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={18} style={{ color: '#0D9488' }} />
                <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Share & Export Collection
                </h3>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ background: 'transparent', padding: '2px', color: 'var(--text-dim)' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Anyone with this share link can import this collection directly into their API Testing workspace.
            </p>

            {/* Generated Share Link Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Generated Share Link</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={exportLoading ? 'Generating link...' : exportShareLink}
                  className="font-mono"
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: '#F8FAFC',
                    color: 'var(--text-main)'
                  }}
                />
                <button
                  onClick={async () => {
                    await SystemAPI.copyText(exportShareLink);
                    setCopiedShareLink(true);
                    setTimeout(() => setCopiedShareLink(false), 2000);
                  }}
                  disabled={exportLoading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#0D9488',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Copy size={13} />
                  <span>{copiedShareLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Other Export Options */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => handleDownloadCollectionFile(activeCol)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#F8FAFC',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Download size={13} />
                <span>Download .json</span>
              </button>

              <button
                onClick={async () => {
                  await SystemAPI.copyText(JSON.stringify(activeCol, null, 2));
                  alert('Collection JSON copied to clipboard!');
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#F8FAFC',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Code2 size={13} />
                <span>Copy Raw JSON</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: IMPORT LINK / OPENAPI */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '26px',
            width: '520px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link2 size={18} style={{ color: '#0D9488' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Import Collection
                </h3>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background: 'transparent', padding: '2px', color: 'var(--text-dim)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Import Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <button
                onClick={() => setImportTab('link')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  background: importTab === 'link' ? '#F0FDFA' : 'transparent',
                  color: importTab === 'link' ? '#0D9488' : 'var(--text-muted)',
                  border: importTab === 'link' ? '1px solid #99F6E4' : 'none'
                }}
              >
                Paste Link (Share Link or OpenAPI URL)
              </button>

              <button
                onClick={() => setImportTab('paste')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  background: importTab === 'paste' ? '#F0FDFA' : 'transparent',
                  color: importTab === 'paste' ? '#0D9488' : 'var(--text-muted)',
                  border: importTab === 'paste' ? '1px solid #99F6E4' : 'none'
                }}
              >
                Paste Raw JSON
              </button>
            </div>

            {/* TAB 1: PASTE LINK INPUT */}
            {importTab === 'link' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Enter a SharePort share link, Swagger/OpenAPI endpoint URL, or public JSON URL:
                </span>
                <input
                  type="text"
                  value={importInputLink}
                  onChange={e => setImportInputLink(e.target.value)}
                  placeholder="https://bytebin.lucko.me/abc or http://localhost:8000/openapi.json"
                  className="font-mono"
                  autoFocus
                  style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button
                    onClick={() => setShowImportModal(false)}
                    style={{ padding: '8px 14px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid var(--border)', fontSize: '12px', fontWeight: '700' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportFromLink}
                    disabled={importLoading || !importInputLink.trim()}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '6px',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: '700',
                      opacity: importLoading || !importInputLink.trim() ? 0.6 : 1
                    }}
                  >
                    {importLoading ? 'Fetching...' : 'Import from Link'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: PASTE RAW JSON */}
            {importTab === 'paste' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={8}
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder={'{\n  "openapi": "3.0.0",\n  "info": { "title": "My API" },\n  "paths": { ... }\n}'}
                  className="font-mono"
                  style={{ width: '100%', padding: '10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button
                    onClick={() => setShowImportModal(false)}
                    style={{ padding: '8px 14px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid var(--border)', fontSize: '12px', fontWeight: '700' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(importJsonText);
                        parseAndImportData(parsed);
                        setShowImportModal(false);
                        setImportJsonText('');
                      } catch (e) {
                        alert('Invalid JSON: ' + e.message);
                      }
                    }}
                    disabled={!importJsonText.trim()}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '6px',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: '700',
                      opacity: importJsonText.trim() ? 1 : 0.6
                    }}
                  >
                    Import JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: ENVIRONMENT VARIABLES & BASE URL SETTINGS */}
      {showVariablesModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '540px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} style={{ color: '#0D9488' }} />
                <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Collection Variables & Base URL
                </h3>
              </div>
              <button onClick={() => setShowVariablesModal(false)} style={{ background: 'transparent', padding: '2px', color: 'var(--text-dim)' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Variables defined here are accessible via <code className="font-mono">{`{{variable}}`}</code> in any URL, header, parameter, auth token, or request body.
            </p>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>VARIABLE</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>INITIAL VALUE</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>DESCRIPTION</th>
                    <th style={{ width: '36px', padding: '8px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {customVariables.map((v, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          value={v.key}
                          onChange={e => {
                            const updated = [...customVariables];
                            updated[idx].key = e.target.value;
                            setCustomVariables(updated);
                          }}
                          placeholder="variable_name"
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          value={v.value}
                          onChange={e => {
                            const updated = [...customVariables];
                            updated[idx].value = e.target.value;
                            setCustomVariables(updated);
                          }}
                          placeholder="value"
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          value={v.description}
                          onChange={e => {
                            const updated = [...customVariables];
                            updated[idx].description = e.target.value;
                            setCustomVariables(updated);
                          }}
                          placeholder="description"
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px' }}>
                        {customVariables.length > 1 && (
                          <button
                            onClick={() => setCustomVariables(customVariables.filter((_, i) => i !== idx))}
                            style={{ color: '#CBD5E1', background: 'transparent' }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setCustomVariables([...customVariables, { key: '', value: '', description: '' }])}
              style={{ alignSelf: 'flex-start', background: 'transparent', color: '#0D9488', fontWeight: '700', fontSize: '12px' }}
            >
              + Add Variable
            </button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <button
                onClick={() => setShowVariablesModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid var(--border)', fontSize: '12px', fontWeight: '700' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const varMap = {};
                  customVariables.forEach(v => {
                    if (v.key.trim()) varMap[v.key.trim()] = v.value || '';
                  });
                  if (varMap.baseUrl) {
                    setBaseUrl(varMap.baseUrl);
                  }
                  // Save to active collection
                  const updated = collections.map(c => {
                    if (c.id === selectedColId) {
                      return { ...c, variables: varMap };
                    }
                    return c;
                  });
                  setCollections(updated);
                  StorageAPI.saveCollections(updated);
                  setShowVariablesModal(false);
                }}
                style={{ padding: '8px 18px', borderRadius: '6px', background: '#0D9488', color: '#FFFFFF', fontSize: '12px', fontWeight: '700' }}
              >
                Save Variables
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: IN-PAGE BATCH COLLECTION RUNNER */}
      {showRunnerModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '680px',
            maxHeight: '85vh',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Collection Runner: {runnerCol?.name}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Runs all {runnerCol?.items?.length || 0} requests sequentially with dynamic variable chaining.
                </span>
              </div>
              <button onClick={() => setShowRunnerModal(false)} style={{ background: 'transparent', padding: '4px', color: 'var(--text-dim)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Real-time Progress Bar */}
            {runnerRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ fontWeight: '700', color: '#0D9488' }}>Running: {runnerProgress.currentName}</span>
                  <span style={{ fontWeight: '700' }}>{runnerProgress.current} / {runnerProgress.total}</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ width: `${(runnerProgress.current / runnerProgress.total) * 100}%`, height: '100%', background: '#0D9488', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}

            {/* Summary Metrics Cards */}
            {runnerSummary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL REQUESTS</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{runnerSummary.totalRequests}</div>
                </div>
                <div style={{ padding: '10px', background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#0D9488', fontWeight: '600' }}>PASSED REQUESTS</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488' }}>{runnerSummary.passedRequests}</div>
                </div>
                <div style={{ padding: '10px', background: runnerSummary.failedRequests > 0 ? '#FFF1F2' : '#F8FAFC', border: `1px solid ${runnerSummary.failedRequests > 0 ? '#FECDD3' : 'var(--border)'}`, borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: runnerSummary.failedRequests > 0 ? '#E11D48' : 'var(--text-muted)', fontWeight: '600' }}>FAILED</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: runnerSummary.failedRequests > 0 ? '#E11D48' : 'var(--text-main)' }}>{runnerSummary.failedRequests}</div>
                </div>
                <div style={{ padding: '10px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>DURATION</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{runnerSummary.durationMs} ms</div>
                </div>
              </div>
            )}

            {/* Results Table */}
            {runnerSummary && (
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>METHOD</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>NAME</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>STATUS</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>LATENCY</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '700' }}>ASSERTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runnerSummary.itemReports.map(ir => {
                      const badge = getMethodBadge(ir.method);
                      const isSuccess = ir.failedCount === 0 && ir.status < 400;
                      return (
                        <tr key={ir.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <span className="font-mono" style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>
                              {ir.method}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: '600' }}>{ir.name}</td>
                          <td style={{ padding: '6px 8px', fontWeight: '700', color: ir.status < 400 ? '#0D9488' : '#E11D48' }}>
                            {ir.status} {ir.statusText}
                          </td>
                          <td style={{ padding: '6px 8px' }}>{ir.timeMs}ms</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ fontWeight: '800', color: isSuccess ? '#0D9488' : '#E11D48' }}>
                              {isSuccess ? '✓ PASS' : '✗ FAIL'} ({ir.passedCount}/{ir.totalCount})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Runner Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <div>
                {runnerSummary && (
                  <button
                    onClick={handleCopyMarkdownReport}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '7px 14px',
                      background: '#F0FDFA',
                      color: '#0D9488',
                      border: '1px solid #99F6E4',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700'
                    }}
                  >
                    <FileText size={13} />
                    <span>{copiedReport ? 'Copied Report!' : '📋 Copy Report'}</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowRunnerModal(false)}
                  style={{ padding: '7px 14px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}
                >
                  Close
                </button>
                <button
                  onClick={() => runBatchCollection(runnerCol)}
                  disabled={runnerRunning}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 16px',
                    borderRadius: '8px',
                    background: '#0D9488',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: 'none',
                    opacity: runnerRunning ? 0.6 : 1
                  }}
                >
                  <RotateCcw size={13} />
                  <span>{runnerRunning ? 'Running...' : 'Run Again'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CREATE COLLECTION */}
      {showColModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '420px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>Create Collection</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Collection Name</label>
              <input
                type="text"
                placeholder="e.g. Authentication APIs"
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                autoFocus
                style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Default Base URL</label>
              <input
                type="text"
                placeholder="http://localhost:3000"
                value={newColBaseUrl}
                onChange={e => setNewColBaseUrl(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setShowColModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F8FAFC', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '700', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCollection}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#0D9488', color: '#FFFFFF', fontSize: '12px', fontWeight: '700', border: 'none' }}
              >
                Create Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CREATE REQUEST */}
      {showReqModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '420px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>Create New Request</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Request Name</label>
              <input
                type="text"
                placeholder="e.g. GET User Profile"
                value={newReqName}
                onChange={e => setNewReqName(e.target.value)}
                autoFocus
                style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
              />
              {(() => {
                const targetCol = collections.find(c => c.id === (newReqColId || selectedColId || collections[0]?.id));
                const isDup = newReqName.trim() && targetCol?.items?.some(i => (i.name || '').trim().toLowerCase() === newReqName.trim().toLowerCase());
                if (isDup) {
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      background: '#FEF3C7',
                      border: '1px solid #FCD34D',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      color: '#B45309'
                    }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      <span>Duplicate detected: A request named "{newReqName.trim()}" already exists in this collection. It will be tagged as Duplicate.</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Method</label>
                <select
                  value={newReqMethod}
                  onChange={e => setNewReqMethod(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Collection</label>
                <select
                  value={newReqColId}
                  onChange={e => setNewReqColId(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
                >
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setShowReqModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F8FAFC', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '700', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRequest}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#0D9488', color: '#FFFFFF', fontSize: '12px', fontWeight: '700', border: 'none' }}
              >
                Add Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: RENAME */}
      {showRenameModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '400px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
              Rename {renameTarget?.type === 'col' ? 'Collection' : 'Request'}
            </h3>

            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              autoFocus
              style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRenameModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F8FAFC', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '700', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRename}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#0D9488', color: '#FFFFFF', fontSize: '12px', fontWeight: '700', border: 'none' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: DELETE CONFIRMATION (YES / NO) */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '410px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#FFE4E6',
                color: '#E11D48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Trash2 size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Delete {deleteConfirm.type === 'col' ? 'Collection' : 'Request'}?
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Are you sure you want to delete <strong style={{ color: 'var(--text-main)' }}>"{deleteConfirm.name}"</strong>?
                </p>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
              This action cannot be undone. Are you sure you wish to proceed?
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  fontWeight: '700',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                No, Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'col') {
                    handleDeleteCollection(deleteConfirm.id);
                  } else {
                    handleDeleteRequest(deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#E11D48',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
