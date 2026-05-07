import { FirebaseError } from 'firebase/app';

export interface FriendlyError {
  title: string;
  message: string;
  rawCode?: string;
  rawMessage?: string;
}

const FIRESTORE_MESSAGES: Record<string, FriendlyError> = {
  'permission-denied': {
    title: 'Acesso negado',
    message: 'Você não tem permissão para isso. Tente sair e entrar novamente.',
  },
  unauthenticated: {
    title: 'Sessão expirada',
    message: 'Sua sessão expirou. Entre novamente para continuar.',
  },
  unavailable: {
    title: 'Serviço indisponível',
    message: 'Não conseguimos conectar ao servidor. Verifique sua conexão.',
  },
  'deadline-exceeded': {
    title: 'Operação demorada',
    message: 'A operação demorou demais. Verifique sua conexão e tente novamente.',
  },
  'not-found': {
    title: 'Não encontrado',
    message: 'O que você procurou não foi encontrado ou foi removido.',
  },
  'already-exists': {
    title: 'Já existe',
    message: 'Isso já existe. Atualize a página e tente novamente.',
  },
  'resource-exhausted': {
    title: 'Limite atingido',
    message: 'O sistema está sobrecarregado. Tente novamente em alguns minutos.',
  },
  'failed-precondition': {
    title: 'Não foi possível completar',
    message: 'Essa ação não pôde ser completada. Atualize e tente novamente.',
  },
  cancelled: {
    title: 'Cancelado',
    message: 'A operação foi cancelada.',
  },
  'data-loss': {
    title: 'Erro de dados',
    message: 'Algo deu errado com os dados. Tente novamente.',
  },
  internal: {
    title: 'Erro interno',
    message: 'Tivemos um problema no servidor. Tente novamente em instantes.',
  },
};

const AUTH_MESSAGES: Record<string, FriendlyError> = {
  'auth/invalid-credential': {
    title: 'Email ou senha incorretos',
    message: 'Verifique seus dados e tente novamente.',
  },
  'auth/wrong-password': {
    title: 'Senha incorreta',
    message: 'A senha que você digitou não confere.',
  },
  'auth/user-not-found': {
    title: 'Usuário não encontrado',
    message: 'Não encontramos uma conta com esse email.',
  },
  'auth/email-already-in-use': {
    title: 'Email já cadastrado',
    message: 'Uma conta com esse email já existe. Tente fazer login.',
  },
  'auth/invalid-email': {
    title: 'Email inválido',
    message: 'O formato do email não parece válido.',
  },
  'auth/weak-password': {
    title: 'Senha fraca',
    message: 'Use uma senha com pelo menos 6 caracteres.',
  },
  'auth/too-many-requests': {
    title: 'Muitas tentativas',
    message: 'Você tentou várias vezes seguidas. Aguarde alguns minutos.',
  },
  'auth/network-request-failed': {
    title: 'Sem conexão',
    message: 'Não conseguimos conectar. Verifique sua internet.',
  },
  'auth/popup-closed-by-user': {
    title: 'Login cancelado',
    message: 'A janela de login foi fechada antes de terminar.',
  },
  'auth/requires-recent-login': {
    title: 'Entre novamente',
    message: 'Por segurança, entre novamente para realizar essa ação.',
  },
};

const STORAGE_MESSAGES: Record<string, FriendlyError> = {
  'storage/unauthorized': {
    title: 'Acesso negado',
    message: 'Você não tem permissão para enviar este arquivo.',
  },
  'storage/canceled': {
    title: 'Upload cancelado',
    message: 'O envio do arquivo foi cancelado.',
  },
  'storage/quota-exceeded': {
    title: 'Limite de armazenamento',
    message: 'O espaço de armazenamento está cheio. Contate o suporte.',
  },
  'storage/retry-limit-exceeded': {
    title: 'Falha no envio',
    message: 'Não conseguimos enviar o arquivo. Verifique sua conexão.',
  },
};

const GENERIC: FriendlyError = {
  title: 'Algo deu errado',
  message: 'Ocorreu um erro inesperado. Tente novamente — se persistir, contate o suporte.',
};

const NETWORK: FriendlyError = {
  title: 'Sem conexão',
  message: 'Você parece estar offline. Verifique sua internet e tente novamente.',
};

export function getFriendlyError(err: unknown): FriendlyError {
  if (err instanceof FirebaseError) {
    const code = err.code;
    const found =
      FIRESTORE_MESSAGES[code] ||
      FIRESTORE_MESSAGES[code.replace(/^firestore\//, '')] ||
      AUTH_MESSAGES[code] ||
      STORAGE_MESSAGES[code];
    if (found) {
      return { ...found, rawCode: code, rawMessage: err.message };
    }
    return { ...GENERIC, rawCode: code, rawMessage: err.message };
  }

  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return { ...NETWORK, rawMessage: err.message };
  }

  if (err instanceof Error) {
    return { ...GENERIC, rawMessage: err.message };
  }

  return GENERIC;
}
