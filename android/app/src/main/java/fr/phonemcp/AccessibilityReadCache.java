package fr.phonemcp;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Build;

/** Clear framework node caches before a new observation, never between cursor pages. */
final class AccessibilityReadCache {
    static String clear(AccessibilityService service) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (!service.clearCache()) throw new IllegalStateException("Accessibility cache refresh unavailable.");
            return "clearCache";
        }
        // Android 11/12 have no public clearCache(). Their public setServiceInfo
        // implementation clears AccessibilityInteractionClient's cache after the
        // service-info update. Reapply exactly the existing configuration; never
        // change capabilities, event subscriptions, packages, flags or timeouts.
        AccessibilityServiceInfo current = service.getServiceInfo();
        if (current == null) throw new IllegalStateException("Accessibility service configuration unavailable.");
        service.setServiceInfo(current);
        return "reapplyServiceInfo";
    }
}
