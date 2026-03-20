import React from 'react';
import { icons } from 'lucide-react';

const toPascalCase = (str) => {
  return str.replace(/(^\w|-\w)/g, (g) => g.replace(/-/, "").toUpperCase());
};

const Icon = ({ name, color, size, className }) => {
  const LucideIcon = icons[toPascalCase(name)];

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon color={color} size={size} className={className} />;
};

export default Icon;
