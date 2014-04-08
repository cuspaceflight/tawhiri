open Core.Std

module Aggregates = struct
    type t = { mutable n : int;
               mutable x : float;
               mutable x2 : float;
               mutable min : float;
               mutable max : float;
               mutable maxmod : float }

    let create () = { n=0; x=0.; x2=0.; min=0.; max=0.; maxmod=0.; }

    let update s value =
        s.x <- s.x +. value;
        s.x2 <- s.x2 +. (value *. value);
        s.min <- if s.n = 0 then value else Float.min s.min value;
        s.max <- if s.n = 0 then value else Float.max s.max value;
        s.maxmod <- Float.max s.maxmod (Float.abs value);
        s.n <- s.n + 1

    let n s = s.n
    let x s = s.x
    let x2 s = s.x2
    let min s = s.min
    let max s = s.max
    let maxmod s = s.maxmod

    let mean { n; x; _ } = x /. (Float.of_int n)
    let variance s = s.x2 /. (Float.of_int s.n) -. mean s ** 2.
    let stddev s = sqrt (variance s)

    let string_list_row_headers = ["n"; "x"; "x2"; "min"; "max"; "maxmod"; "mean"; "variance"; "stddev"]
    let to_string_list s =
        let getters = [x; x2; min; max; maxmod; mean; variance; stddev] in
        Int.to_string s.n :: List.map ~f:(fun g -> Float.to_string (g s)) getters
end

type variable = { levels : Aggregates.t array; everywhere : Aggregates.t }
type t = variable array

let create () =
    let _, n_levels, n_vars, _, _ = Dataset.shape in
    let create_variable _ =
        let levels = Array.init n_levels ~f:(fun _ -> Aggregates.create ()) in
        { levels; everywhere=Aggregates.create () }
    in
    Array.init n_vars ~f:create_variable

let update stats _ j k _ _ value =
    Aggregates.update stats.(k).levels.(j) value;
    Aggregates.update stats.(k).everywhere value

let analyse ds =
    let s = create () in
    Dataset.iter ~f:(update s) ds;
    s

let get stats ?level ~variable =
    match level with
    | Some l -> stats.(variable).levels.(l)
    | None -> stats.(variable).everywhere

let to_table stats =
    let headers = "variable"::"level"::Aggregates.string_list_row_headers in
    (* row variable_index level_index aggregate *)
    let row' k j a = Int.to_string k :: j :: Aggregates.to_string_list a in
    let row k j a = row' k (Int.to_string j) a in
    let variable_rows k v =
        row' k "*" v.everywhere ::
            Array.to_list (Array.mapi ~f:(row k) v.levels)
    in
    let body =
        Array.mapi stats ~f:variable_rows
        |> Array.to_list
        |> List.concat
    in
    Table.of_string_list_list (headers :: body)
