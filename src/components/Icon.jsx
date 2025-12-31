import React from 'react';
import * as LucideIcons from 'lucide-react';

const Icon = ({ name, size = 20, className = "" }) => {
  // Convert "arrow-right" to "ArrowRight"
  const formatName = (str) => {
    if (!str) return 'HelpCircle';
    return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  };

  const IconComponent = LucideIcons[formatName(name)] || LucideIcons.HelpCircle;

  return <IconComponent size={size} className={className} />;
};

export default Icon;