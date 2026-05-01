import ldap from 'ldapjs';

function escapeFilter(s) {
  return String(s).replace(/[*()\\\x00]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

function firstVal(obj, key) {
  const v = obj?.[key];
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : '';
  return v != null ? String(v) : '';
}

function allVals(obj, key) {
  const v = obj?.[key];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(String);
}

/**
 * @returns {Promise<import('../authProfile.js').NormalizedAuthProfile>}
 */
export async function ldapAuthenticate(username, password, ldapCfg, ldapId = 'ldap') {
  const url = ldapCfg.url;
  if (!url) throw new Error('LDAP url missing');

  const clientOpts = { url };
  if (String(url).startsWith('ldaps://') && ldapCfg.tlsRejectUnauthorized === false) {
    clientOpts.tlsOptions = { rejectUnauthorized: false };
  }

  const client = ldap.createClient(clientOpts);

  await new Promise((resolve, reject) => {
    client.bind(ldapCfg.bindDn, ldapCfg.bindPassword, (err) => (err ? reject(err) : resolve()));
  });

  const filterTpl =
    ldapCfg.userSearchFilter || '(|(uid={{username}})(sAMAccountName={{username}})(mail={{username}}))';
  const filter = filterTpl.replace(/\{\{username\}\}/g, escapeFilter(username));
  const searchBase = ldapCfg.searchBase || ldapCfg.userSearchBase;
  if (!searchBase) throw new Error('LDAP searchBase / userSearchBase required');

  const attrStr = ldapCfg.userAttributeList || 'mail,cn,department,title,memberOf,manager';
  const attrs = attrStr.split(/[\s,]+/).filter(Boolean);

  const entries = await new Promise((resolve, reject) => {
    const out = [];
    client.search(searchBase, { scope: 'sub', filter, attributes: attrs, sizeLimit: 5 }, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (entry) => {
        try {
          out.push(entry.pojo || entry);
        } catch {
          out.push({});
        }
      });
      res.on('error', reject);
      res.on('end', () => resolve(out));
    });
  });

  await new Promise((resolve, reject) => client.unbind((err) => (err ? reject(err) : resolve())));

  if (!entries.length) throw new Error('LDAP user not found');

  const userObj = entries[0];
  const dn = userObj.dn || userObj.objectName;
  if (!dn) throw new Error('LDAP entry missing dn');

  const userClient = ldap.createClient(clientOpts);
  await new Promise((resolve, reject) => {
    userClient.bind(dn, password, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => userClient.unbind((err) => (err ? reject(err) : resolve())));

  const mailKey = ldapCfg.emailAttribute || 'mail';
  const nameKey = ldapCfg.displayNameAttribute || 'cn';
  const deptKey = ldapCfg.departmentAttribute || 'department';
  const titleKey = ldapCfg.titleAttribute || 'title';
  const groupKey = ldapCfg.groupAttribute || 'memberOf';

  const mail = firstVal(userObj, mailKey);
  const email = String(mail || `${username}@ldap.local`).trim().toLowerCase();
  const display_name = firstVal(userObj, nameKey) || username;
  const department = firstVal(userObj, deptKey) || undefined;
  const title = firstVal(userObj, titleKey) || undefined;
  const groups = allVals(userObj, groupKey).map(extractCnFromDn);

  return {
    provider: 'ldap',
    providerSubject: dn,
    providerIssuer: `${ldapId}:${url}`,
    email,
    display_name,
    groups,
    department,
    title,
    manager_email: undefined,
  };
}

function extractCnFromDn(dn) {
  const m = String(dn).match(/CN=([^,]+)/i);
  return m ? m[1] : String(dn);
}
