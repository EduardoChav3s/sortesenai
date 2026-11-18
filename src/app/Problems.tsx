// When something goes wrong: a crash inside a page, or an address that does not exist.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import s from './Problems.module.css';

/** Catches a crash in the page below it and shows a way out instead of a blank screen. */
export class ErrorScreen extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SorteSenai: a página quebrou', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={`panel ${s.box}`} role="alert">
        <img className={s.mark} src="/brand/mascote.webp" alt="" width={72} height={72} />
        <h2 className={s.title}>Algo deu errado</h2>
        <p className={s.text}>Essa parte do álbum travou. Recarregar costuma resolver. Suas cartas e moedas estão salvas.</p>
        <div className={s.actions}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recarregar
          </button>
          <a className="btn btn-secondary" href="/">
            Ir para Roletar
          </a>
        </div>
      </div>
    );
  }
}

export function NotFoundPage() {
  return (
    <div className={`panel ${s.box}`}>
      <span className={s.code} aria-hidden="true">
        404
      </span>
      <h2 className={s.title}>Página não encontrada</h2>
      <p className={s.text}>Esse endereço não existe no álbum. Pode ter sido um link errado.</p>
      <div className={s.actions}>
        <Link className="btn btn-primary" to="/">
          Voltar para Roletar
        </Link>
      </div>
    </div>
  );
}
