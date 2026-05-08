import React, { useState, useEffect, useRef } from 'react';
import { Upload, Database, MessageSquare, Send, Table, Info, Trash2, Cpu, Sparkles, Download, LayoutDashboard, Pin, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ChartComponent from './components/ChartComponent';
import './App.css';

function App() {
  const [db, setDb] = useState(null);
  const [schema, setSchema] = useState('');
  const [dbName, setDbName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [pinnedCharts, setPinnedCharts] = useState(() => {
    const saved = localStorage.getItem('pinnedCharts');
    return saved ? JSON.parse(saved) : [];
  });
  const chatEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('pinnedCharts', JSON.stringify(pinnedCharts));
  }, [pinnedCharts]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('database', file);

    try {
      setIsLoading(true);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      setSchema(data.schema);
      setDbName(data.fileName);
      setDb(true); // Just to indicate DB is loaded
      setMessages([{
        role: 'system',
        content: `Successfully loaded **${data.fileName}**. I'm ready to answer your questions!`
      }]);
    } catch (error) {
      console.error(error);
      alert("Failed to load database: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !db) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMessage, 
          schema, 
          history: messages 
        }),
      });
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response,
        query: data.query,
        visualization: data.visualization,
        chartData: data.data?.raw,
        hasData: data.data?.values?.length > 0,
        isAction: data.isAction
      }]);

      if (data.data && data.data.values.length > 0) {
        setResults({ query: data.query, data: data.data });
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = async (query) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Execution Error: " + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setResults(null);
    setPinnedCharts([]);
  };

  const disconnectDatabase = () => {
    setDb(null);
    setDbName('');
    setSchema('');
    clearChat();
  };

  const pinChart = (msg) => {
    const newChart = {
      id: Date.now(),
      query: msg.query,
      title: msg.visualization.title,
      type: msg.visualization.type,
      xAxis: msg.visualization.xAxis,
      yAxis: msg.visualization.yAxis,
      data: msg.chartData
    };
    setPinnedCharts(prev => [...prev, newChart]);
    alert("Chart pinned to dashboard!");
  };

  const unpinChart = (id) => {
    setPinnedCharts(prev => prev.filter(c => c.id !== id));
  };

  const downloadCSV = () => {
    if (!results || !results.data) return;
    
    const { columns, raw } = results.data;
    const csvContent = [
      columns.join(','),
      ...raw.map(row => columns.map(col => {
        const val = row[col];
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="brand">
          <div className="logo-icon">
            <Cpu size={24} />
          </div>
          <h2 className="gradient-text">DB Insight AI</h2>
        </div>

        <div className="sidebar-content">
          <div className="nav-tabs">
            <button 
              className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={16} /> Chat
            </button>
            <button 
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
          </div>

          <div className="section-title">
            <Database size={16} />
            <span>Database</span>
          </div>
          
          {!db ? (
            <label className="upload-zone">
              <Upload size={24} />
              <span>Upload SQLite</span>
              <input id="db-upload-input" type="file" accept=".db,.sqlite,.sqlite3" onChange={handleFileUpload} hidden />
            </label>
          ) : (
            <div className="db-info glass-panel">
              <div className="db-name">
                <Info size={14} />
                <span>{dbName}</span>
              </div>
              <button className="btn-icon" onClick={disconnectDatabase} title="Disconnect & Clear All">
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {schema && (
            <div className="schema-viewer">
              <div className="section-title">
                <Table size={16} />
                <span>Schema Explorer</span>
              </div>
              <pre className="schema-text">{schema}</pre>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="status-badge">
            <div className={`status-dot ${db ? 'online' : 'offline'}`}></div>
            <span>{db ? 'Database Ready' : 'Awaiting Data'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header glass-panel">
          <div className="header-info">
            <h1>Intelligence Lab</h1>
            <p>Talk to your data with Generative AI</p>
          </div>
          <button className="btn-secondary" onClick={clearChat} title="Start a fresh conversation and clear the dashboard">
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        </header>

        {activeTab === 'dashboard' ? (
          <div className="dashboard-container">
            <div className="dashboard-header">
              <h2>Your Live Dashboard</h2>
              <p>Pinned visualizations from your queries.</p>
            </div>
            {pinnedCharts.length === 0 ? (
              <div className="empty-dashboard">
                <LayoutDashboard size={48} className="text-dim" />
                <h3>No charts pinned yet</h3>
                <p>Ask a question in the Chat tab and click the Pin icon on any chart to save it here.</p>
              </div>
            ) : (
              <div className="dashboard-grid">
                {pinnedCharts.map(chart => (
                  <div key={chart.id} className="dashboard-card glass-panel">
                    <div className="dashboard-card-header">
                      <button className="btn-icon" onClick={() => unpinChart(chart.id)} title="Unpin">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <ChartComponent 
                      type={chart.type}
                      data={chart.data}
                      xAxis={chart.xAxis}
                      yAxis={chart.yAxis}
                      title={chart.title}
                    />
                    <div className="dashboard-card-footer">
                      <code>{chart.query}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
          <div className="chat-container">
          <AnimatePresence mode='popLayout'>
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="welcome-screen"
              >
                <div className="welcome-icon">
                  <Sparkles size={48} />
                </div>
                <h2>Ready to explore?</h2>
                <p>Upload a database file to start asking questions in natural language.</p>
                <div className="feature-grid">
                  <div className="feature-card">
                    <Database size={20} />
                    <h3>Direct Query</h3>
                    <p>No more complex SQL writing. Just ask.</p>
                  </div>
                  <div className="feature-card">
                    <Table size={20} />
                    <h3>Visualization</h3>
                    <p>See results in beautiful structured tables.</p>
                  </div>
                  <div className="feature-card">
                    <MessageSquare size={20} />
                    <h3>Smart Insights</h3>
                    <p>AI interprets raw data into meaningful answers.</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="message-list">
                {messages.map((msg, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`message ${msg.role}`}
                  >
                    <div className="message-bubble glass-panel">
                      <p>{msg.content}</p>
                      
                      {msg.visualization && msg.visualization.type !== 'none' && (
                        <div className="chart-container-wrapper">
                          <ChartComponent 
                            type={msg.visualization.type}
                            data={msg.chartData}
                            xAxis={msg.visualization.xAxis}
                            yAxis={msg.visualization.yAxis}
                            title={msg.visualization.title}
                          />
                          <button className="btn-pin" onClick={() => pinChart(msg)}>
                            <Pin size={14} /> Pin to Dashboard
                          </button>
                        </div>
                      )}

                      {msg.query && (
                        <div className="sql-box">
                          <code>{msg.query}</code>
                          {msg.isAction && (
                            <button 
                              className="btn-execute" 
                              onClick={() => handleExecuteAction(msg.query)}
                            >
                              Confirm Execution
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="message assistant"
                  >
                    <div className="message-bubble glass-panel loading-bubble">
                      <div className="typing-indicator">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {results && results.data.values.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="results-panel glass-panel"
          >
            <div className="results-header">
              <div className="flex items-center gap-4">
                <h3>Query Results</h3>
                <button className="btn-text" onClick={downloadCSV}>
                  <Download size={14} />
                  <span>Download CSV</span>
                </button>
              </div>
              <button className="btn-close" onClick={() => setResults(null)}>×</button>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    {results.data.columns.map(col => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.data.values.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j}>{cell?.toString() || 'NULL'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <footer className="input-area">
          <form onSubmit={handleSend} className="input-wrapper glass-panel">
            <input 
              type="text" 
              placeholder={db ? "Ask about your data (e.g. 'Show me the top 5 customers')" : "Upload a database to start"} 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!db || isLoading}
            />
            <button type="submit" disabled={!db || !input.trim() || isLoading}>
              <Send size={20} />
            </button>
          </form>
        </footer>
        </>
        )}
      </main>
    </div>
  );
}

export default App;
