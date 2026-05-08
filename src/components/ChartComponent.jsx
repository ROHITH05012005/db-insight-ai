import React from 'react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, Legend 
} from 'recharts';

const COLORS = ['#8b5cf6', '#ec4899', '#22d3ee', '#f59e0b', '#10b981', '#6366f1'];

const ChartComponent = ({ type, data, xAxis, yAxis, title }) => {
  if (!data || data.length === 0 || type === 'none') return null;

  const renderChart = () => {
    switch (type.toLowerCase()) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={xAxis} stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <YAxis stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <Tooltip 
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}
              itemStyle={{ color: '#f8fafc' }}
            />
            <Bar dataKey={yAxis} fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={xAxis} stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <YAxis stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <Tooltip 
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
            />
            <Line type="monotone" dataKey={yAxis} stroke="#ec4899" strokeWidth={3} dot={{ fill: '#ec4899', r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={xAxis} stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <YAxis stroke="#94a3b8" fontSize={11} tick={{fill: '#94a3b8'}} />
            <Tooltip 
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
            />
            <Area type="monotone" dataKey={yAxis} stroke="#22d3ee" fillOpacity={1} fill="url(#colorArea)" strokeWidth={3} />
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={yAxis}
              nameKey={xAxis}
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={60}
              paddingAngle={5}
              label
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
            />
            <Legend verticalAlign="bottom" height={36}/>
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="chart-wrapper glass-panel" style={{ minHeight: '350px' }}>
      <h4>{title}</h4>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChartComponent;
