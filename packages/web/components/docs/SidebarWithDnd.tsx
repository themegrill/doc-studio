"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import {
  ChevronRight,
  ChevronDown,
  Book,
  Plus,
  GripVertical,
} from "lucide-react";
import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import AddSectionButton from "@/components/docs/AddSectionButton";
import AddDocumentButton from "@/components/docs/AddDocumentButton";
import { useEditing } from "@/contexts/EditingContext";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Helper component to render title with badges
const TitleWithBadges = memo(({ title }: { title: string }) => {
  const { cleanTitle, badges } = useMemo(() => parseTitleWithBadges(title), [title]);

  return (
    <span className="inline-flex items-center">
      {cleanTitle}
      {badges.map((badge, idx) => (
        <Badge key={`badge-${idx}-${badge.text}`} variant={badge.variant} className="ml-1.5 text-[10px] px-1.5 py-0">
          {badge.text}
        </Badge>
      ))}
    </span>
  );
});
TitleWithBadges.displayName = "TitleWithBadges";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  type ClientRect,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SidebarProps {
  navigation: Navigation;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
  projectMetadata?: Record<string, any>;
}

export default function SidebarWithDnd({
  navigation,
  isAuthenticated,
  projectSlug,
  projectMetadata = {},
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isEditing, isDirty } = useEditing();
  const [routes, setRoutes] = useState<NavRoute[]>(navigation?.routes || []);
  const [openSectionPath, setOpenSectionPath] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragOverSectionIdRef = useRef<string | null>(null);
  const prevNavigationRef = useRef<Navigation | null>(null);

  // Sync routes with navigation prop when it changes
  // This is intentional: we need local state for DnD optimistic updates,
  // but also need to sync with server data after router.refresh()
  useEffect(() => {
    if (navigation?.routes && prevNavigationRef.current !== navigation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoutes(navigation.routes);
      prevNavigationRef.current = navigation;
    }
  }, [navigation]);

  // Auto-expand the section containing the current page
  useEffect(() => {
    if (!pathname || !routes.length) return;

    // Find which section contains the current page
    for (const route of routes) {
      // Check if current path matches the section itself (if it has a path)
      if (route.path) {
        const sectionSlug = route.path.replace(/^\/docs\//, "");
        const sectionPath = projectSlug
          ? `/projects/${projectSlug}/docs/${sectionSlug}`
          : `/docs/${sectionSlug}`;

        if (pathname === sectionPath) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setOpenSectionPath(route.id || route.path);
          return;
        }
      }

      // Check if current path matches any child document
      if (route.children) {
        for (const child of route.children) {
			if (!child.path) continue;

			const childSlug = child.path.replace(/^\/docs\//, "");
			const childPath = projectSlug
            ? `/projects/${projectSlug}/docs/${childSlug}`
            : `/docs/${childSlug}`;

          if (pathname === childPath) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setOpenSectionPath(route.id ?? route.path ?? null);
            return;
          }
        }
      }
    }
  }, [pathname, routes, projectSlug]);

  // Multi-container collision detection (dnd-kit "multiple containers" pattern).
  // The key requirement: while dragging a doc, a sibling DOC under the pointer must
  // always win over the large section *container* rect that encloses it — otherwise
  // within-section sorting resolves to the container (or, via transform-shifted rects,
  // an adjacent section) and the topic either does nothing or jumps to the wrong
  // category. Section containers are only chosen when the pointer is genuinely over a
  // header / empty section body (enabling intentional cross-section + empty drops).
  const collisionDetection = useCallback(
    (args: Parameters<typeof closestCorners>[0]) => {
      const activeId = args.active.id as string;

      // Section drags: only ever collide with other section containers. Otherwise,
      // dropping a section over an *expanded* section resolves `over` to one of its
      // child docs, the section-reorder branch bails, and the drag is a no-op
      // (the category appears to snap back). Restricting droppables keeps the target
      // a section regardless of which sections are expanded. Covers the keyboard
      // sensor too (no pointerCoordinates).
      if (activeId.startsWith("section-")) {
        return closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            String(c.id).startsWith("section-"),
          ),
        });
      }

      // Keyboard sensor for docs (no pointer) keeps default behavior.
      if (!activeId.startsWith("doc-") || !args.pointerCoordinates) {
        return closestCorners(args);
      }

      // Precise containment first; fall back to rect intersection.
      const pointerHits = pointerWithin(args);
      const intersections =
        pointerHits.length > 0 ? pointerHits : rectIntersection(args);

      // Prefer a sibling doc under the pointer over any section container.
      const docHit = intersections.find(
        (c) => String(c.id).startsWith("doc-") && c.id !== activeId,
      );
      if (docHit) return [docHit];

      // No doc under the pointer → over a section header / empty section body.
      const sectionHit = intersections.find((c) =>
        String(c.id).startsWith("section-"),
      );
      if (sectionHit) return [sectionHit];

      // Pointer in a gap → nearest sibling DOC only (never a section container),
      // using a 1px cursor rect so sorting tracks the actual pointer position.
      const { x, y } = args.pointerCoordinates;
      const cursorRect: ClientRect = { left: x, right: x + 1, top: y, bottom: y + 1, width: 1, height: 1 };
      return closestCorners({
        ...args,
        collisionRect: cursorRect,
        droppableContainers: args.droppableContainers.filter(
          (c) => String(c.id).startsWith("doc-") && c.id !== activeId,
        ),
      });
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    dragOverSectionIdRef.current = null;
    setDragOverSectionId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeItemId = active.id as string;

    if (!activeItemId.startsWith("doc-") || !over) {
      if (dragOverSectionIdRef.current !== null) {
        dragOverSectionIdRef.current = null;
        setDragOverSectionId(null);
      }
      return;
    }

    const overId = over.id as string;
    const sourceSectionId = active.data?.current?.sortable?.containerId as string | undefined;
    let targetSectionId: string | null = null;

    if (overId.startsWith("section-")) {
      // Strip the "section-" prefix to get the raw route id/path
      targetSectionId = overId.slice("section-".length);
    } else if (overId.startsWith("doc-")) {
      targetSectionId = (over.data?.current?.sortable?.containerId as string) ?? null;
    }

    // sourceSectionId comes from String(route.id || route.path) set on the inner SortableContext
    const next = targetSectionId && targetSectionId !== sourceSectionId ? targetSectionId : null;
    if (dragOverSectionIdRef.current !== next) {
      dragOverSectionIdRef.current = next;
      setDragOverSectionId(next);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    // The drag-over ref/state is only a visual highlight signal — clear it here.
    // Correctness is derived entirely from the active/over sortable data below.
    setActiveId(null);
    dragOverSectionIdRef.current = null;
    setDragOverSectionId(null);

    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const withOrderIndex = (child: NavRoute, index: number) => ({ ...child, orderIndex: index });

    // ── Section reorder ──
    if (activeId.startsWith("section-") && overId.startsWith("section-")) {
      if (activeId === overId) return;
      const oldIndex = routes.findIndex((r) => `section-${r.id || r.path}` === activeId);
      const newIndex = routes.findIndex((r) => `section-${r.id || r.path}` === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const newRoutes = arrayMove(routes, oldIndex, newIndex).map(withOrderIndex);
      setRoutes(newRoutes);
      await updateNavigationOrder(newRoutes);
      return;
    }

    // ── Doc move / reorder ──
    if (!activeId.startsWith("doc-")) return;

    // Source section comes from dnd-kit's authoritative sortable.containerId.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceContainerId = (active.data.current as any)?.sortable?.containerId;
    const sourceSectionIndex = routes.findIndex(
      (r) => String(r.id || r.path) === String(sourceContainerId),
    );

    // Target section: from the over doc's container, or the section header id.
    let targetContainerId: string | undefined;
    if (overId.startsWith("doc-")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetContainerId = (over.data.current as any)?.sortable?.containerId;
    } else if (overId.startsWith("section-")) {
      targetContainerId = overId.slice("section-".length);
    } else {
      return;
    }
    const targetSectionIndex = routes.findIndex(
      (r) => String(r.id || r.path) === String(targetContainerId),
    );
    if (sourceSectionIndex === -1 || targetSectionIndex === -1) return;

    const activeDocPath = activeId.slice("doc-".length);
    const sourceChildren = routes[sourceSectionIndex].children ?? [];
    const activeDocIndex = sourceChildren.findIndex((c) => c.path === activeDocPath);
    if (activeDocIndex === -1) return;

    // ── Same-section reorder ──
    if (sourceSectionIndex === targetSectionIndex) {
      // Dropped on the section header / container, not a sibling doc → no reorder.
      if (!overId.startsWith("doc-")) return;
      const overDocPath = overId.slice("doc-".length);
      const overDocIndex = sourceChildren.findIndex((c) => c.path === overDocPath);
      if (overDocIndex === -1 || overDocIndex === activeDocIndex) return;

      const newChildren = arrayMove(sourceChildren, activeDocIndex, overDocIndex).map(withOrderIndex);
      const newRoutes = routes.map((r, i) =>
        i === sourceSectionIndex ? { ...r, children: newChildren } : r,
      );
      setRoutes(newRoutes);
      await updateNavigationOrder(newRoutes);
      return;
    }

    // ── Cross-section move ──
    const targetChildren = routes[targetSectionIndex].children ?? [];
    let insertIndex = targetChildren.length;
    if (overId.startsWith("doc-")) {
      const overDocPath = overId.slice("doc-".length);
      const idx = targetChildren.findIndex((c) => c.path === overDocPath);
      if (idx !== -1) insertIndex = idx;
    }

    const newSourceChildren = [...sourceChildren];
    const [movedDoc] = newSourceChildren.splice(activeDocIndex, 1);
    const newTargetChildren = [...targetChildren];
    newTargetChildren.splice(insertIndex, 0, movedDoc);

    const newRoutes = routes.map((r, i) => {
      if (i === sourceSectionIndex) return { ...r, children: newSourceChildren.map(withOrderIndex) };
      if (i === targetSectionIndex) return { ...r, children: newTargetChildren.map(withOrderIndex) };
      return r;
    });
    setRoutes(newRoutes);
    await updateNavigationOrder(newRoutes);
  };

  const updateNavigationOrder = async (newRoutes: NavRoute[]) => {
    if (!projectSlug) return;

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/navigation/reorder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            structure: {
              title: navigation.title,
              version: navigation.version,
              routes: newRoutes,
            },
          }),
        },
      );

      if (response.ok) {
        // The server may rewrite slugs/paths when a topic moves to a new section
        // (DOCSTUDIO-21). Apply the authoritative structure it returns so sidebar
        // links reflect the new paths immediately.
        const data = await response.json().catch(() => null);
        if (data?.structure?.routes) {
          setRoutes(data.structure.routes);
        }
        router.refresh();
      } else {
        console.error("Failed to update navigation order");
      }
    } catch (error) {
      console.error("Error updating navigation order:", error);
    }
  };

  const onLinkClick = useCallback((e: React.MouseEvent) => {
    if (isEditing && isDirty) {
      const confirmed = window.confirm("You have unsaved changes. Leave without saving?");
      if (!confirmed) e.preventDefault();
    }
  }, [isEditing, isDirty]);

  const sectionIds = useMemo(
    () => routes.map((route) => `section-${route.id || route.path}`),
    [routes],
  );

  // The item currently being dragged — rendered as a clean, collapsed clone in the
  // DragOverlay so the drag follows the cursor smoothly regardless of how tall an
  // expanded section is in the list.
  const activeOverlay = useMemo(() => {
    if (!activeId) return null;
    if (activeId.startsWith("section-")) {
      const route = routes.find(
        (r) => `section-${r.id || r.path}` === activeId,
      );
      return route ? { title: route.title } : null;
    }
    if (activeId.startsWith("doc-")) {
      const path = activeId.slice("doc-".length);
      for (const route of routes) {
        const child = route.children?.find((c) => c.path === path);
        if (child) return { title: child.title };
      }
    }
    return null;
  }, [activeId, routes]);

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="w-96 border-r bg-gray-50 px-4 py-6 overflow-y-auto h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
          <Book size={18} className="text-gray-600" />
          <h4 className="text-md font-semibold text-gray-900 uppercase tracking-wide">
            Documentation
          </h4>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <nav className="space-y-1.5 flex-1">
            <SortableContext
              items={sectionIds}
              strategy={verticalListSortingStrategy}
            >
              {routes.map((route) => {
                const routeId = route.id || route.path;
                return (
                  <SortableNavItem
                    key={routeId}
                    route={route}
                    pathname={pathname}
                    isAuthenticated={isAuthenticated}
                    projectSlug={projectSlug}
                    isOpen={openSectionPath === routeId}
                    isDropTarget={dragOverSectionId === routeId}
                    onToggle={() =>
                      setOpenSectionPath(
                        openSectionPath === routeId ? null : ( routeId ?? null ),
                      )
                    }
                    onLinkClick={onLinkClick}
                  />
                );
              })}
            </SortableContext>

            {/* Add Section button - below all navigation items */}
            {isAuthenticated && projectSlug && (
              <div className="mt-4 pt-4">
                <AddSectionButton projectSlug={projectSlug} />
              </div>
            )}
          </nav>

          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
            {activeOverlay ? (
              <div className="flex items-center gap-1 rounded-md bg-white shadow-lg ring-1 ring-blue-300">
                <div className="cursor-grabbing p-1">
                  <GripVertical size={14} className="text-gray-400" />
                </div>
                <div className="flex-1 px-3 py-2.5 text-sm font-semibold text-gray-700">
                  <TitleWithBadges title={activeOverlay.title} />
                </div>
              </div>
            ) : null}
          </DragOverlay>

        </DndContext>

        {/* Mobile Navigation Links */}
        {(projectMetadata?.websiteLink || projectMetadata?.pricingLink || projectMetadata?.changelogLink) && (
          <div className="mt-auto pt-6 border-t border-gray-200 space-y-2 lg:hidden">
            <h5 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Links
            </h5>
            <div className="space-y-1">
              {projectMetadata.changelogLink && (
                <a
                  href={projectMetadata.changelogLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Changelog
                </a>
              )}
              {projectMetadata.websiteLink && (
                <a
                  href={projectMetadata.websiteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Website
                </a>
              )}
              {projectMetadata.pricingLink && (
                <a
                  href={projectMetadata.pricingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Pricing
                </a>
              )}
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

// Sortable NavItem component
const SortableNavItem = memo(function SortableNavItem({
  route,
  pathname,
  isAuthenticated,
  projectSlug: propProjectSlug,
  isOpen,
  isDropTarget,
  onToggle,
  onLinkClick,
}: {
  route: NavRoute;
  pathname: string;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
  isOpen: boolean;
  isDropTarget?: boolean;
  onToggle: () => void;
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const hasChildren = route.children && route.children.length > 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${route.id || route.path}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  const projectSlug = useMemo(() => {
    if (propProjectSlug) return propProjectSlug;
    const match = pathname.match(/^\/projects\/([^\/]+)/);
    return match ? match[1] : null;
  }, [pathname, propProjectSlug]);

  const buildLink = useCallback(
    (path: string | undefined) => {
      if (!path) return "#";
      const cleanPath = path.replace(/^\/docs\//, "");
      if (projectSlug) {
        return `/projects/${projectSlug}/docs/${cleanPath}`;
      } else {
        return `/docs/${cleanPath}`;
      }
    },
    [projectSlug],
  );

  // For sections without path (categories), generate slug from title
  const parentLink = useMemo(() => {
    if (route.path) {
      return buildLink(route.path);
    } else if (route.children && route.children.length > 0) {
      // For flat document structures, slugify the section title
      const sectionSlug = route.title
        .toLowerCase()
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
      return buildLink(sectionSlug);
    }
    return "#";
  }, [buildLink, route.path, route.children, route.title]);

  const isParentActive = pathname === parentLink;

  const sectionSlug = useMemo(() => {
		if (route.path) {
			return route.path.replace(/^\/docs\//, "");
		}

		const firstChild = route.children?.[0];

		if (firstChild?.path) {
			return firstChild.path.replace(/^\/docs\//, "");
		}

		return "";
	}, [route.path, route.children]);
  const isExpandable = hasChildren || (isAuthenticated && projectSlug);

  const childrenIds = useMemo(
    () => (route.children || []).map((child) => `doc-${child.path}`),
    [route.children],
  );

  return (
    <div ref={setNodeRef} style={style}>
      {isExpandable ? (
        <>
          <div
            className="flex items-center gap-1 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {isAuthenticated && (
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <GripVertical size={14} className="text-gray-400" />
              </div>
            )}

            <Link
              href={parentLink}
              onClick={(e) => {
                onLinkClick?.(e);
                if (!e.defaultPrevented && hasChildren) {
                  onToggle();
                }
              }}
              className={`flex-1 flex items-center justify-between px-3 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                isParentActive
                  ? "bg-blue-100 text-blue-700"
                  : isDropTarget
                  ? "bg-blue-50 text-blue-600 ring-1 ring-blue-300"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <TitleWithBadges title={route.title} />
              {hasChildren &&
                (isOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                ))}
            </Link>

            {isAuthenticated && projectSlug && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddDialog(true);
                    }}
                    className={`p-2 hover:bg-blue-100 hover:text-blue-700 rounded-md transition-all ${
                      isHovered
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <Plus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add document</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div
            className={`grid transition-all duration-300 ease-in-out ${
              isOpen && !isDragging
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              {hasChildren && (
                <div className="ml-1 mt-1.5 space-y-1 pl-1">
                  <SortableContext
                    id={String(route.id || route.path)}
                    items={childrenIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {route.children?.map((child) => (
                      <SortableDocItem
                        key={child.path}
                        child={child}
                        buildLink={buildLink}
                        pathname={pathname}
                        isAuthenticated={isAuthenticated}
                        onLinkClick={onLinkClick}
                        disabled={!isOpen}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}
            </div>
          </div>

          {isAuthenticated && projectSlug && (
            <AddDocumentButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={route.title}
              open={showAddDialog}
              onOpenChange={setShowAddDialog}
              hideTrigger
            />
          )}
        </>
      ) : (
        <div className="flex items-center gap-1 group">
          {isAuthenticated && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <GripVertical size={14} className="text-gray-400" />
            </div>
          )}
          <Link
            href={buildLink(route.path)}
            onClick={onLinkClick}
            className={`flex-1 flex items-center font-semibold px-3 py-2.5 text-sm rounded-md transition-colors ${
              pathname === buildLink(route.path)
                ? "bg-blue-100 text-blue-700 "
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <TitleWithBadges title={route.title} />
          </Link>
        </div>
      )}
    </div>
  );
});

// Sortable document item
const SortableDocItem = memo(function SortableDocItem({
  child,
  buildLink,
  pathname,
  isAuthenticated,
  onLinkClick,
  disabled,
}: {
  child: NavRoute;
  buildLink: (path: string) => string;
  pathname: string;
  isAuthenticated?: boolean;
  onLinkClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `doc-${child.path}`, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  const childLink = child.path ? buildLink(child.path) : "#";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 group"
    >
      {isAuthenticated && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical size={14} className="text-gray-400" />
        </div>
      )}
      <Link
        href={childLink}
        onClick={onLinkClick}
        className={`flex-1 flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
          pathname === childLink
            ? "bg-blue-100 text-blue-700 font-medium"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <TitleWithBadges title={child.title} />
      </Link>
    </div>
  );
});
