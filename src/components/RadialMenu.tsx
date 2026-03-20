import React from 'react';
import Icon from './Icon';
// TODO: Add framer-motion to add a "pop" animation when the menu opens

const RadialMenu = ({ x, y, onAction }) => {
  const actions = [
    { id: 'delete', icon: 'trash' },
    { id: 'toggle-visibility', icon: 'eye' },
    { id: 'open-sheet', icon: 'sheet' },
  ];

  const radius = 60; // The radius of the circle on which the buttons lie

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      className="pointer-events-auto"
    >
      {actions.map((action, i) => {
        const angle = (i / actions.length) * 2 * Math.PI;
        const buttonX = Math.cos(angle) * radius;
        const buttonY = Math.sin(angle) * radius;
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className="absolute bg-blue-500 rounded-full w-10 h-10 flex items-center justify-center text-white"
            style={{
              transform: `translate(${buttonX}px, ${buttonY}px)`,
            }}
          >
            <Icon name={action.icon} />
          </button>
        );
      })}
    </div>
  );
};

export default RadialMenu;
