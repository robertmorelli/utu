export async function getWorkspaceSymbols(
    workspaceSymbols,
    query,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return workspaceSymbols.getWorkspaceSymbols(query);
}
