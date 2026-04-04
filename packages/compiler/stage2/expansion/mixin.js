export function installMixin(targetClass, mixinClass) {
    for (const name of Object.getOwnPropertyNames(mixinClass.prototype)) {
        if (name !== 'constructor') {
            targetClass.prototype[name] = mixinClass.prototype[name];
        }
    }
}
