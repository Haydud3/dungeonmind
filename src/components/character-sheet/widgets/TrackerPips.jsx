import React from 'react';

const TrackerPips = ({ 
    max, 
    current, 
    onChange, 
    readOnly = false,
    color = 'amber', // 'amber', 'red', 'green', 'indigo'
    className = ''
}) => {
    // Generate arrays for rendering
    const pips = Array.from({ length: max || 0 });

    const getColorClasses = (isActive) => {
        if (!isActive) return 'bg-slate-900 border-slate-600';
        
        switch(color) {
            case 'red': return 'bg-red-500 border-red-600';
            case 'green': return 'bg-green-500 border-green-600';
            case 'indigo': return 'bg-indigo-500 border-indigo-600';
            case 'amber':
            default: return 'bg-amber-500 border-amber-600';
        }
    };

    return (
        <div className={`flex flex-wrap justify-end gap-1 ${className}`} onClick={(e) => e.stopPropagation()}>
            {pips.map((_, i) => {
                const isActive = i < current;
                return (
                    <div 
                        key={i} 
                        onClick={() => {
                            if (!readOnly && onChange) {
                                // If clicking the last active pip, we might want to decrement.
                                // Common pattern: clicking index `i` sets current to `i + 1`.
                                // If `current` is already `i + 1`, we set it to `i`.
                                const newValue = (current === i + 1) ? i : i + 1;
                                onChange(newValue);
                            }
                        }}
                        className={`w-3 h-3 rounded-full border transition-colors ${getColorClasses(isActive)} ${!readOnly ? 'cursor-pointer hover:brightness-125' : 'cursor-default opacity-80'}`} 
                    />
                );
            })}
        </div>
    );
};

export default TrackerPips;
