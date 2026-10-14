import React from 'react';
import { APP_NAME } from '../../config/app';
import { COMPANY } from '../../config/company';

/** Bloco de identificação do responsável pelo serviço (rodapé das páginas legais). */
export const CompanyIdentity: React.FC = () => (
  <section className="mt-8 pt-6 border-t border-line text-xs text-ink-tertiary leading-relaxed space-y-1">
    <p className="font-semibold text-ink-secondary">Responsável pelo serviço</p>
    <p>
      {APP_NAME} é operado por {COMPANY.legalName}, CNPJ {COMPANY.cnpj}, {COMPANY.city}/{COMPANY.state}.
    </p>
    <p>
      Contato, suporte e privacidade: <a className="underline" href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>
    </p>
  </section>
);
