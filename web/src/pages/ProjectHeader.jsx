import React from 'react';
import { Button, Badge } from '../ui.jsx';
import { useApp } from '../App.jsx';
import { statusOf } from './Dashboard.jsx';

export function ProjectHeader({ project, tab, guests, responses, actions }) {
  const { nav, me } = useApp();
  const st = statusOf(project);
  return (
    <div className="proj-head">
      <div className="proj-head-top">
        {me.role !== 'couple' && <Button variant="ghost" icon="left" onClick={() => nav('dashboard')} aria-label="К приглашениям" />}
        <div>
          <h1>{project.title}</h1>
          <Badge tone={st.tone} dot>{st.label}</Badge>
        </div>
        <span className="grow" />
        {actions}
      </div>
      <nav className="ed-tabs ed-tabs-page" aria-label="Разделы приглашения">
        <button type="button" className={tab === 'editor' ? 'on' : ''} onClick={() => nav('editor-' + project.id)}>Конструктор</button>
        <button type="button" className={tab === 'guests' ? 'on' : ''} onClick={() => nav('guests-' + project.id)}>Гости <span className="num">{guests ?? project.stats.guests}</span></button>
        <button type="button" className={tab === 'responses' ? 'on' : ''} onClick={() => nav('responses-' + project.id)}>Ответы <span className="num">{responses ?? project.stats.responses}</span></button>
      </nav>
    </div>
  );
}
