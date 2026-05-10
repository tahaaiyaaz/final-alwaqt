import React, { useState, useEffect } from 'react';

export default function CustomTimePicker({ value, onChange, defaultPeriod = 'PM' }) {
    const [hour, setHour] = useState('12');
    const [minute, setMinute] = useState('00');
    const [period, setPeriod] = useState(defaultPeriod);

    useEffect(() => {
        if (value) {
            let [h, m] = value.split(':');
            h = parseInt(h, 10);
            const isPM = h >= 12;
            const periodVal = isPM ? 'PM' : 'AM';
            let hour12 = h % 12;
            if (hour12 === 0) hour12 = 12;
            
            setHour(hour12.toString().padStart(2, '0'));
            setMinute(m);
            setPeriod(periodVal);
        } else {
            // Apply logical defaults when empty
            setHour('12');
            setMinute('00');
            setPeriod(defaultPeriod);
        }
    }, [value, defaultPeriod]);

    const handleUpdate = (h, m, p) => {
        setHour(h);
        setMinute(m);
        setPeriod(p);

        let h24 = parseInt(h, 10);
        if (p === 'PM' && h24 !== 12) h24 += 12;
        if (p === 'AM' && h24 === 12) h24 = 0;
        
        onChange(h24.toString().padStart(2, '0') + ':' + m);
    };

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
            <div style={{ flex: 1, position: 'relative' }}>
                <select 
                    value={hour} 
                    onChange={(e) => handleUpdate(e.target.value, minute, period)}
                    style={{ 
                        width: '100%', 
                        padding: '10px 8px', 
                        borderRadius: '8px', 
                        border: '1px solid #D1D5DB', 
                        backgroundColor: '#F9FAFB',
                        fontSize: '16px',
                        appearance: 'none',
                        textAlign: 'center'
                    }}
                >
                    {Array.from({length: 12}, (_, i) => i + 1).map(num => {
                        const val = num.toString().padStart(2, '0');
                        return <option key={val} value={val}>{val}</option>;
                    })}
                </select>
            </div>
            <span style={{ fontWeight: 600, color: '#4B5563' }}>:</span>
            <div style={{ flex: 1, position: 'relative' }}>
                <select 
                    value={minute} 
                    onChange={(e) => handleUpdate(hour, e.target.value, period)}
                    style={{ 
                        width: '100%', 
                        padding: '10px 8px', 
                        borderRadius: '8px', 
                        border: '1px solid #D1D5DB', 
                        backgroundColor: '#F9FAFB',
                        fontSize: '16px',
                        appearance: 'none',
                        textAlign: 'center'
                    }}
                >
                    {Array.from({length: 60}, (_, i) => i).map(num => {
                        const val = num.toString().padStart(2, '0');
                        return <option key={val} value={val}>{val}</option>;
                    })}
                </select>
            </div>
            <div style={{ position: 'relative' }}>
                <select 
                    value={period} 
                    onChange={(e) => handleUpdate(hour, minute, e.target.value)}
                    style={{ 
                        width: '70px', 
                        padding: '10px 8px', 
                        borderRadius: '8px', 
                        border: '1px solid #D1D5DB', 
                        backgroundColor: '#E5E7EB',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        color: '#1F2937',
                        appearance: 'none',
                        textAlign: 'center'
                    }}
                >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                </select>
            </div>
        </div>
    );
}
