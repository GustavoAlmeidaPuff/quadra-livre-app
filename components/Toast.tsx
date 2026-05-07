import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFriendlyError } from '@/lib/errors';

type ToastVariant = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  showError: (err: unknown, fallbackTitle?: string) => void;
  showSuccess: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
      showError: (err) => console.error('[toast-fallback]', err),
      showSuccess: () => {},
    };
  }
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>((toast) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const showError = useCallback<ToastContextValue['showError']>(
    (err, fallbackTitle) => {
      console.error('[toast-error]', err);
      const friendly = getFriendlyError(err);
      showToast({
        variant: 'error',
        title: fallbackTitle ?? friendly.title,
        description: friendly.message,
      });
    },
    [showToast]
  );

  const showSuccess = useCallback<ToastContextValue['showSuccess']>(
    (title, description) => {
      showToast({ variant: 'success', title, description });
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}
      <View
        style={[styles.container, { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const ICON_MAP: Record<ToastVariant, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  error: { name: 'warning', color: '#ef4444' },
  success: { name: 'checkmark-circle', color: '#10b981' },
  info: { name: 'information-circle', color: '#6b7280' },
};

const BORDER_MAP: Record<ToastVariant, string> = {
  error: '#fecaca',
  success: '#a7f3d0',
  info: '#e5e7eb',
};

function ToastView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const translateY = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const icon = ICON_MAP[toast.variant];
  const borderColor = BORDER_MAP[toast.variant];

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderColor, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={icon.name} size={20} color={icon.color} style={styles.toastIcon} />
      <View style={styles.toastBody}>
        <Text style={styles.toastTitle}>{toast.title}</Text>
        {toast.description && (
          <Text style={styles.toastDesc}>{toast.description}</Text>
        )}
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close" size={16} color="#9ca3af" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  toastIcon: {
    marginTop: 1,
  },
  toastBody: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  toastDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
    lineHeight: 18,
  },
});
