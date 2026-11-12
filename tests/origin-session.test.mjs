import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrigin, originPolicy, originFailure} from '../src/lib/origin-policy.ts';
import {selectedSessionCookies, SESSION_MAX_AGE} from '../src/lib/auth-cookies.ts';

const official='https://controle-cliente-renata.vercel.app';
const alternate='https://cadastro-adv.vercel.app';
const policy=originPolicy({VERCEL:'1',APP_ORIGIN:official,APP_ALLOWED_ORIGINS:alternate});
const request=(origin,extra={})=>new Request(official+'/api/cadastro',{method:'POST',headers:{...(origin?{Origin:origin}:{}),Host:new URL(official).host,...extra}});
test('origens explícitas aceitam caixa e porta padrão sem confiar em forwarded headers',()=>{
 for(const value of [official,official+':443',official.toUpperCase(),official+'/'])assert.equal(originFailure(request(value),policy),null);
 assert.equal(originFailure(new Request(alternate,{method:'POST',headers:{Origin:alternate,Host:new URL(alternate).host}}),policy),null);
 assert.equal(originFailure(request(official,{'X-Forwarded-Host':'interno.example','X-Forwarded-Proto':'http'}),policy),null);
});
test('origens ausentes, maliciosas e headers falsificados continuam recusados',()=>{
 for(const value of [undefined,'null','https://example.invalid',official+'.example.invalid','https://preview-aleatorio.vercel.app','http://controle-cliente-renata.vercel.app',official+'/caminho',official+'?q=1','https://usuario@controle-cliente-renata.vercel.app'])assert(originFailure(request(value),policy));
 assert(originFailure(request('https://example.invalid',{'X-Forwarded-Host':new URL(official).host,Referer:official}),policy));
 assert(originFailure(request(official,{Host:'example.invalid','X-Forwarded-Host':new URL(official).host}),policy));
 assert.equal(originFailure(request(official,{'Sec-Fetch-Site':'cross-site'}),policy),'cross_site');
});
test('configuração falha fechada para wildcard, HTTP em produção e credenciais embutidas',()=>{
 for(const value of ['https://*.vercel.app','http://example.test','https://x:y@example.test','https://example.test/path',''])assert.throws(()=>normalizeOrigin(value,true));
 assert.equal(originPolicy({APP_ORIGIN:'http://localhost:3196'}).primary,'http://localhost:3196');
});
test('cookies antigos não sobrepõem o cookie do caminho mais específico nem misturam chunks',()=>{
 assert.deepEqual(selectedSessionCookies('renata-sessao=atual; renata-sessao=antigo'),[{name:'renata-sessao',value:'atual'}]);
 assert.deepEqual(selectedSessionCookies('renata-sessao.0=parte0; renata-sessao.1=parte1; renata-sessao=raiz'),[{name:'renata-sessao.0',value:'parte0'},{name:'renata-sessao.1',value:'parte1'}]);
 assert.deepEqual(selectedSessionCookies('renata-sessao=nova; renata-sessao.0=antiga'),[{name:'renata-sessao',value:'nova'}]);
 assert.deepEqual(selectedSessionCookies('qualquer=x; renata-sessao.falsa=x; renata-sessao=%'),[]);
 assert.equal(SESSION_MAX_AGE,604800);
});
