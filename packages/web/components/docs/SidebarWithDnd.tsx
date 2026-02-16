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
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
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
}

export default function SidebarWithDnd({
  navigation,
  isAuthenticated,
  projectSlug,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [routes, setRoutes] = useState<NavRoute[]>(navigation?.routes || []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openSectionPath, setOpenSectionPath] = useState<string | null>(null);
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
          const childSlug = child.path.replace(/^\/docs\//, "");
          const childPath = projectSlug
            ? `/projects/${projectSlug}/docs/${childSlug}`
            : `/docs/${childSlug}`;

          if (pathname === childPath) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setOpenSectionPath(route.id || route.path);
            return;
          }
        }
      }
    }
  }, [pathname, routes, projectSlug]);

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're moving a section or a document
    if (activeId.startsWith("section-") && overId.startsWith("section-")) {
      // Moving sections
      const oldIndex = routes.findIndex(
        (r) => `section-${r.id || r.path}` === activeId,
      );
      const newIndex = routes.findIndex((r) => `section-${r.id || r.path}` === overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newRoutes = arrayMove(routes, oldIndex, newIndex).map(
          (route, index) => ({
            ...route,
            orderIndex: index,
          }),
        );
        setRoutes(newRoutes);

        // Persist to backend
        await updateNavigationOrder(newRoutes);
      }
    } else if (activeId.startsWith("doc-") && overId.startsWith("doc-")) {
      // Moving documents within the same section or between sections
      const activeDocId = activeId.replace("doc-", "");
      const overDocId = overId.replace("doc-", "");

      // Find which sections contain these documents
      let activeSectionIndex = -1;
      let activeDocIndex = -1;
      let overSectionIndex = -1;
      let overDocIndex = -1;

      routes.forEach((route, sIdx) => {
        route.children?.forEach((child, dIdx) => {
          if (child.path === activeDocId) {
            activeSectionIndex = sIdx;
            activeDocIndex = dIdx;
          }
          if (child.path === overDocId) {
            overSectionIndex = sIdx;
            overDocIndex = dIdx;
          }
        });
      });

      if (activeSectionIndex !== -1 && overSectionIndex !== -1) {
        const newRoutes = [...routes];

        // Moving within the same section
        if (activeSectionIndex === overSectionIndex) {
          const section = newRoutes[activeSectionIndex];
          if (section.children) {
            const newChildren = arrayMove(
              section.children,
              activeDocIndex,
              overDocIndex,
            ).map((child, index) => ({
              ...child,
              orderIndex: index,
            }));
            newRoutes[activeSectionIndex] = {
              ...section,
              children: newChildren,
            };
          }
        } else {
          // Moving between sections
          const activeSection = newRoutes[activeSectionIndex];
          const overSection = newRoutes[overSectionIndex];

          if (activeSection.children && overSection.children) {
            const [movedDoc] = activeSection.children.splice(activeDocIndex, 1);
            overSection.children.splice(overDocIndex, 0, movedDoc);

            // Update order indices
            activeSection.children = activeSection.children.map(
              (child, index) => ({
                ...child,
                orderIndex: index,
              }),
            );
            overSection.children = overSection.children.map((child, index) => ({
              ...child,
              orderIndex: index,
            }));
          }
        }

        setRoutes(newRoutes);
        await updateNavigationOrder(newRoutes);
      }
    }
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
        router.refresh();
      } else {
        console.error("Failed to update navigation order");
      }
    } catch (error) {
      console.error("Error updating navigation order:", error);
    }
  };

  // Get the active item for drag overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null;

    if (activeId.startsWith("section-")) {
      const id = activeId.replace("section-", "");
      return routes.find((r) => (r.id || r.path) === id);
    } else if (activeId.startsWith("doc-")) {
      const path = activeId.replace("doc-", "");
      for (const route of routes) {
        const doc = route.children?.find((c) => c.path === path);
        if (doc) return doc;
      }
    }
    return null;
  }, [activeId, routes]);

  const sectionIds = useMemo(
    () => routes.map((route) => `section-${route.id || route.path}`),
    [routes],
  );

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
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
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
                    onToggle={() =>
                      setOpenSectionPath(
                        openSectionPath === routeId ? null : routeId,
                      )
                    }
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

          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <div className="flex items-center gap-1 cursor-grabbing">
                <div className="p-1 bg-white rounded">
                  <GripVertical size={14} className="text-gray-400" />
                </div>
                <div className="flex items-center px-3 py-2.5 bg-white border-2 border-blue-500 rounded-md shadow-xl">
                  <span className="text-sm font-semibold text-gray-900">
                    {activeItem.title}
                  </span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
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
  onToggle,
}: {
  route: NavRoute;
  pathname: string;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
  isOpen: boolean;
  onToggle: () => void;
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
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? "grabbing" : "default",
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
    } else if (route.children && route.children.length > 0) {
      return route.children[0].path.replace(/^\/docs\//, "");
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
              onClick={() => {
                if (hasChildren) {
                  onToggle();
                }
              }}
              className={`flex-1 flex items-center justify-between px-3 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                isParentActive
                  ? "bg-blue-100 text-blue-700"
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
              isOpen
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              {hasChildren && (
                <div className="ml-1 mt-1.5 space-y-1 pl-1">
                  <SortableContext
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
}: {
  child: NavRoute;
  buildLink: (path: string) => string;
  pathname: string;
  isAuthenticated?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `doc-${child.path}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? "grabbing" : "default",
  };

  const childLink = buildLink(child.path);

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
