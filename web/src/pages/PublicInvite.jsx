import React, { useEffect, useState } from 'react';
import { api, get } from '../api.js';
import { TemplateFrame } from '../Preview.jsx';
import { Icon } from '../ui.jsx';

export function PublicInvite({ slug, guestToken }) {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [g, peek] = (guestToken || '').split('?');
  useEffect(() => {
    get('/public/invite/' + slug, { ...(g ? { g } : {}), ...(peek ? { peek: '1' } : {}) }).then(setInv).catch(e => setErr(e.message));
  }, [slug, g]);
  if (err) return <div className="public-err"><Icon name="heart" size={28} /><h1>Приглашение недоступно</h1><p>{err}</p></div>;
  if (!inv) return <div className="boot"><span className="spin" /></div>;
  return (
    <div className="public">
      <TemplateFrame project={{ id: inv.id, templateId: inv.templateId, data: inv.data }} mode="public" brand={inv.brand} guest={inv.guest} fill
        onRsvp={payload => api('POST', '/public/rsvp/' + slug, payload, g ? { g } : undefined)} />
    </div>
  );
}
